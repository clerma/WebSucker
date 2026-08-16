import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { timingSafeEqual } from "crypto";
import * as fs from "fs";
import { storage } from "./storage";
import { rateLimit } from "./security";
import { scrapeWebsite, cleanupScrapeFiles } from "./scraper";
import { startScrapeSchema, scrapeAnalytics, payments } from "@shared/schema";
import type { Asset, ScrapeProgress, ScrapeJob } from "@shared/schema";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql, desc, count, sum } from "drizzle-orm";
import { db } from "./db";

// Send a notification to a configurable webhook URL (Discord, Slack, Make, etc.)
async function sendNotification(payload: { title: string; message: string; url: string; status: "completed" | "failed" }) {
  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const body = webhookUrl.includes("discord.com")
      ? JSON.stringify({ content: `**${payload.title}**\n${payload.message}` })
      : webhookUrl.includes("hooks.slack.com")
      ? JSON.stringify({ text: `*${payload.title}*\n${payload.message}` })
      : JSON.stringify(payload);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (err) {
    console.error("Notification webhook failed:", err);
  }
}

const jobConnections = new Map<string, Set<WebSocket>>();

/**
 * Constant-time admin authentication. Returns true only when ADMIN_SECRET is
 * configured and the supplied header matches it. Fails closed when unset.
 */
function isAdmin(req: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return false;
  const header = req.headers["x-admin-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (typeof provided !== "string" || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(adminSecret);
  // timingSafeEqual requires equal lengths; the length check itself is not
  // secret (ADMIN_SECRET length is fixed), so compare lengths first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req)) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

// Rate limiters (in-memory, per-IP) for abuse-prone endpoints.
const scrapeLimiter = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "scrape", message: "Too many scrape requests. Please wait a minute and try again." });
const redeemLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "redeem", message: "Too many attempts. Please wait a minute and try again." });
const lookupLimiter = rateLimit({ windowMs: 60_000, max: 6, keyPrefix: "lookup", message: "Too many lookups. Please wait a minute and try again." });
const adminLimiter = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "admin", message: "Too many requests." });
const paymentLimiter = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "payment", message: "Too many requests. Please wait a moment." });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Send a ping to every connected client every 25 seconds to keep the
  // connection alive through proxies that close idle connections.
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 25000);
  
  wss.on("connection", (ws) => {
    let subscribedJobId: string | null = null;
    
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "subscribe" && data.jobId) {
          subscribedJobId = data.jobId;
          
          if (!jobConnections.has(data.jobId)) {
            jobConnections.set(data.jobId, new Set());
          }
          jobConnections.get(data.jobId)!.add(ws);

          // Send an immediate catch-up snapshot so reconnected clients see
          // the current state without waiting for the next broadcast.
          storage.getJob(data.jobId).then((job) => {
            if (!job || ws.readyState !== ws.OPEN) return;

            if (job.status === "completed") {
              // Job already done — send complete event right away.
              ws.send(JSON.stringify({ type: "complete", job }));
              return;
            }

            if (job.status === "failed") {
              ws.send(JSON.stringify({ type: "error", message: (job as any).errorMessage || "Scraping failed." }));
              return;
            }

            if (job.status === "scraping") {
              // Send current progress so the counter catches up.
              ws.send(JSON.stringify({
                type: "progress",
                progress: {
                  jobId: job.id,
                  status: job.status,
                  totalAssets: job.totalAssets,
                  processedAssets: job.processedAssets,
                  successfulAssets: job.successfulAssets,
                  failedAssets: job.failedAssets,
                  message: "Reconnected — catching up…",
                },
              }));
              // Replay all assets already downloaded so the results list isn't empty.
              for (const asset of job.assets) {
                if (ws.readyState !== ws.OPEN) break;
                ws.send(JSON.stringify({ type: "asset", asset }));
              }
            }
          }).catch(() => { /* job not found — ignore */ });
        }

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });
    
    ws.on("close", () => {
      if (subscribedJobId) {
        const connections = jobConnections.get(subscribedJobId);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) {
            jobConnections.delete(subscribedJobId);
          }
        }
      }
    });
  });

  wss.on("close", () => clearInterval(heartbeatInterval));

  // Graceful shutdown: close the WebSocket server cleanly before exit
  const gracefulShutdown = () => {
    wss.close();
    setTimeout(() => process.exit(0), 500);
  };

  process.once("SIGTERM", gracefulShutdown);
  process.once("SIGINT", gracefulShutdown);
  
  function broadcast(jobId: string, data: any) {
    const connections = jobConnections.get(jobId);
    if (connections) {
      const message = JSON.stringify(data);
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  // Adult-content domain detection — checked before any job is created or stored.
  const ADULT_TLDS = new Set([".xxx", ".adult", ".porn", ".sex"]);
  const ADULT_KEYWORDS = [
    "pornhub", "xvideos", "xnxx", "redtube", "youporn", "xhamster",
    "brazzers", "bangbros", "realitykings", "naughtyamerica", "mofos",
    "twistys", "hustler", "penthouse", "onlyfans", "slutload", "beeg",
    "xtube", "tube8", "tnaflix", "porntube", "drtuber", "hardsextube",
    "bangbus", "spankwire", "sunporno", "eporner", "hclips", "pornmd",
    "gaytube", "gaymaletube", "dudesnude", "just-for-fans", "4tube",
    "porndig", "alohatube", "iceporn", "hellporno", "fuqer", "hdzog",
    "faketaxi", "publicagent", "povd", "camdolls", "stripchat",
    "chaturbate", "myfreecams", "cam4", "livejasmin", "bongacams",
    "sex.com", "porn.com", "xxxvideos", "xxxhd", "xxnx", "xnxx",
    "teenagesex", "freeporn", "hotporn", "analporn", "milfhunter",
    "maturetube", "grandmatube", "spankbang", "fuqtube", "cumlouder",
    "ah-me", "jizzbunker", "keezmovies", "thenewporn", "pornovideoshub",
    "watchmygf", "hentaihaven", "nhentai", "rule34", "gelbooru",
    "sankakucomplex", "danbooru", "e-hentai", "exhentai",
    "onlyshare.io", "ouraidream",
  ];

  function isAdultUrl(rawUrl: string): boolean {
    let hostname: string;
    try {
      hostname = new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return false;
    }
    // Check adult TLDs
    for (const tld of ADULT_TLDS) {
      if (hostname.endsWith(tld)) return true;
    }
    // Check domain keywords
    for (const kw of ADULT_KEYWORDS) {
      if (hostname.includes(kw)) return true;
    }
    return false;
  }

  app.post("/api/scrape", scrapeLimiter, async (req, res) => {
    try {
      const validatedData = startScrapeSchema.parse(req.body);

      if (isAdultUrl(validatedData.url)) {
        return res.status(400).json({
          message: "We do not back up adult websites.",
        });
      }

      const job = await storage.createJob(validatedData.url);
      
      (async () => {
        try {
          const zipPath = await scrapeWebsite({
            jobId: job.id,
            url: validatedData.url,
            onProgress: (progress: ScrapeProgress, asset?: Asset) => {
              broadcast(job.id, { type: "progress", progress });
              if (asset) {
                broadcast(job.id, { type: "asset", asset });
              }
            },
          });
          
          const completedJob = await storage.completeJob(job.id, zipPath);

          // Persist to DB (survives server restarts)
          const finalJob = await storage.getJob(job.id);
          db.insert(scrapeAnalytics).values({
            url: job.url,
            status: "completed",
            totalAssets: finalJob?.totalAssets ?? 0,
            successfulAssets: finalJob?.successfulAssets ?? 0,
            failedAssets: finalJob?.failedAssets ?? 0,
            completedAt: new Date(),
          }).catch((e: any) => console.error("Analytics insert failed:", e));

          // Schedule automatic cleanup after 10 minutes so temp files don't pile up.
          // The timer is cancelled if the user downloads first.
          const TTL_MS = 10 * 60 * 1000;
          storage.scheduleExpiry(job.id, async () => {
            await cleanupScrapeFiles(job.id);
            await storage.deleteJob(job.id);
          }, TTL_MS);

          // Re-fetch job so expiresAt is included in the broadcast
          const jobWithExpiry = await storage.getJob(job.id);
          broadcast(job.id, { type: "complete", job: jobWithExpiry ?? completedJob });
          
        } catch (error) {
          console.error("Scrape error:", error);
          const errMsg = error instanceof Error ? error.message : "Scraping failed";
          await storage.updateJobStatus(job.id, "failed");
          await storage.updateJobProgress(job.id, { errorMessage: errMsg });

          // Free the partial /tmp output immediately so failed jobs don't leak
          // disk. Keep the job record briefly so the client's reconnect poll can
          // still read the failure, then GC it.
          await cleanupScrapeFiles(job.id);
          storage.scheduleExpiry(job.id, async () => {
            await storage.deleteJob(job.id);
          }, 2 * 60 * 1000);

          // Persist failure to DB
          db.insert(scrapeAnalytics).values({
            url: job.url,
            status: "failed",
            totalAssets: 0,
            successfulAssets: 0,
            failedAssets: 0,
            completedAt: new Date(),
            errorMessage: errMsg,
          }).catch((e: any) => console.error("Analytics insert failed:", e));

          // Send failure notification
          sendNotification({
            title: "Scrape failed",
            message: `URL: ${job.url}\nError: ${errMsg}`,
            url: job.url,
            status: "failed",
          });

          broadcast(job.id, { type: "error", message: errMsg });
        }
      })();
      
      res.json(job);
    } catch (error) {
      console.error("Scrape start error:", error);
      res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });
  
  app.get("/api/scrape/:id", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job" });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Failed to get publishable key:", error);
      res.status(500).json({ message: "Failed to get Stripe configuration" });
    }
  });

  app.get("/api/stripe/prices", async (_req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active: true, limit: 100 });

      const webSuckerProduct = products.data.find(
        (p) => p.metadata?.app === "websucker" || p.name === "WebSucker"
      );

      if (!webSuckerProduct) {
        return res.json({ prices: [] });
      }

      const prices = await stripe.prices.list({ product: webSuckerProduct.id, active: true });

      const formattedPrices = prices.data.map((price) => ({
        id: price.id,
        unitAmount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring ? { interval: price.recurring.interval } : null,
        metadata: price.metadata,
      }));

      res.json({
        product: {
          id: webSuckerProduct.id,
          name: webSuckerProduct.name,
          description: webSuckerProduct.description,
        },
        prices: formattedPrices,
      });
    } catch (error) {
      console.error("Failed to fetch prices:", error);
      res.status(500).json({ message: "Failed to fetch pricing" });
    }
  });

  app.post("/api/stripe/checkout", paymentLimiter, async (req, res) => {
    try {
      const { priceId, jobId } = req.body;
      if (!priceId || typeof priceId !== "string" || !jobId) {
        return res.status(400).json({ message: "Missing priceId or jobId" });
      }

      const job = await storage.getJob(jobId);
      if (!job || job.status !== "completed") {
        return res.status(400).json({ message: "Job not found or not completed" });
      }

      const stripe = await getUncachableStripeClient();
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });

      // Only allow prices that belong to the WebSucker product. Without this a
      // user could pass any active priceId in the account (e.g. a cheaper or
      // $0 price) and still have the download authorized on payment.
      const product = price.product;
      const isWebSuckerPrice =
        price.active &&
        typeof product === "object" &&
        product !== null &&
        !("deleted" in product && product.deleted) &&
        ((product as any).metadata?.app === "websucker" || (product as any).name === "WebSucker");
      if (!isWebSuckerPrice) {
        return res.status(400).json({ message: "Invalid price" });
      }

      const mode = price.recurring ? "subscription" : "payment";

      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode,
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&job_id=${jobId}`,
        cancel_url: `${baseUrl}/checkout/cancel?job_id=${jobId}`,
        metadata: {
          jobId,
          app: "websucker",
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.get("/api/stripe/verify-payment", paymentLimiter, async (req, res) => {
    try {
      const { session_id } = req.query;
      if (!session_id || typeof session_id !== "string") {
        return res.status(400).json({ paid: false, message: "Missing session_id" });
      }

      if (storage.isSessionConsumed(session_id)) {
        return res.status(400).json({ paid: false, message: "Session already used" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status === "paid" && session.metadata?.jobId) {
        const jobId = session.metadata.jobId;

        storage.authorizeDownload(jobId, session_id);

        // Persist payment record to DB (survives key changes)
        try {
          await db.insert(payments).values({
            stripeSessionId: session_id,
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            customerEmail: session.customer_details?.email ?? null,
            amountCents: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            mode: session.mode ?? "payment",
            jobId,
          }).onConflictDoNothing();
        } catch (e) {
          console.error("Failed to persist payment record:", e);
        }

        return res.json({
          paid: true,
          jobId,
          customerEmail: session.customer_details?.email,
          isSubscription: session.mode === "subscription",
          customerId: session.customer,
        });
      }

      res.json({ paid: false });
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ paid: false, message: "Verification failed" });
    }
  });

  app.get("/api/stripe/check-subscription", async (req, res) => {
    try {
      const { customer_id } = req.query;
      if (!customer_id || typeof customer_id !== "string") {
        return res.json({ active: false });
      }

      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: customer_id,
        status: "active",
        limit: 1,
      });

      res.json({ active: subscriptions.data.length > 0 });
    } catch (error) {
      console.error("Subscription check error:", error);
      res.json({ active: false });
    }
  });

  app.post("/api/stripe/authorize-subscriber-download", paymentLimiter, async (req, res) => {
    try {
      const { customerId, jobId } = req.body;
      if (!customerId || !jobId) {
        return res.status(400).json({ authorized: false });
      }

      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        storage.authorizeDownload(jobId, `sub_${customerId}_${jobId}`);
        return res.json({ authorized: true });
      }

      res.json({ authorized: false });
    } catch (error) {
      console.error("Subscription auth error:", error);
      res.json({ authorized: false });
    }
  });
  
  app.get("/api/scrape/:id/download", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      if (job.status !== "completed" || !job.downloadPath) {
        return res.status(400).json({ message: "Download not ready" });
      }

      if (!storage.isDownloadAuthorized(req.params.id)) {
        return res.status(402).json({ message: "Payment required" });
      }

      try {
        await fs.promises.access(job.downloadPath);
      } catch {
        return res.status(404).json({ message: "Download file not found" });
      }

      // Cancel the 10-minute expiry timer so it doesn't delete files mid-download
      storage.cancelExpiry(job.id);
      storage.recordDownload();
      
      const hostname = new URL(job.url).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="website-sucker-${hostname}.zip"`
      );
      
      const fileStream = fs.createReadStream(job.downloadPath);

      // Clean up exactly once, whether the download finishes, errors, or the
      // client aborts mid-stream. Previously only "end" was handled, so an
      // aborted download (with the expiry timer already cancelled above) leaked
      // the temp files and job until process restart.
      let cleanedUp = false;
      const finalizeDownload = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        setTimeout(async () => {
          await cleanupScrapeFiles(job.id);
          await storage.deleteJob(job.id);
        }, 5000);
      };

      fileStream.on("error", (err) => {
        console.error("Download stream error:", err);
        finalizeDownload();
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      fileStream.on("end", finalizeDownload);
      res.on("close", () => {
        // Fired if the client disconnects before the stream finishes.
        if (!res.writableFinished) {
          fileStream.destroy();
          finalizeDownload();
        }
      });

      fileStream.pipe(res);

    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Download failed" });
    }
  });

  app.post("/api/stripe/customer-lookup", lookupLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ found: false, message: "Email required" });
      }

      const stripe = await getUncachableStripeClient();
      const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 5 });

      for (const customer of customers.data) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: "active",
          limit: 1,
        });
        if (subscriptions.data.length > 0) {
          return res.json({ found: true, customerId: customer.id, email: customer.email });
        }
      }

      res.json({ found: false, message: "No active subscription found for this email" });
    } catch (error) {
      console.error("Customer lookup error:", error);
      res.status(500).json({ found: false, message: "Lookup failed" });
    }
  });

  // Access code management (admin-protected)
  app.get("/api/admin/access-codes", adminLimiter, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ codes: await storage.listAccessCodes() });
  });

  app.post("/api/admin/access-codes", adminLimiter, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { note, maxUses } = req.body;
    const code = await storage.createAccessCode(note || "", maxUses ?? null);
    res.json({ code });
  });

  app.delete("/api/admin/access-codes/:code", adminLimiter, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const deleted = await storage.deleteAccessCode(String(req.params.code));
    res.json({ deleted });
  });

  // Redeem an access code to authorize a download
  app.post("/api/access-code/redeem", redeemLimiter, async (req, res) => {
    const { code, jobId } = req.body;
    if (!code || !jobId) {
      return res.status(400).json({ success: false, message: "Code and jobId are required" });
    }
    const valid = await storage.redeemAccessCode(code);
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid or expired access code" });
    }
    storage.authorizeDownload(jobId, `code:${code}:${jobId}`);
    res.json({ success: true });
  });

  app.get("/api/admin/stats", adminLimiter, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      // Query persistent analytics from DB
      const [dbRows, recentRows] = await Promise.all([
        db.select().from(scrapeAnalytics),
        db.select().from(scrapeAnalytics).orderBy(desc(scrapeAnalytics.createdAt)).limit(50),
      ]);

      const totalJobsCreated = dbRows.length;
      const totalAssetsScraped = dbRows.reduce((s, r) => s + r.successfulAssets, 0);
      const totalDownloads = storage.getAnalytics().totalDownloads; // still in-memory (download events only)
      const uniqueUrls = [...new Set(dbRows.map(r => { try { return new URL(r.url).hostname; } catch { return r.url; } }))];

      const analytics = {
        totalJobsCreated,
        totalAssetsScraped,
        totalDownloads,
        uniqueUrlsScraped: uniqueUrls,
        recentJobs: recentRows.map(r => ({
          id: String(r.id),
          url: r.url,
          status: r.status,
          totalAssets: r.totalAssets,
          successfulAssets: r.successfulAssets,
          failedAssets: r.failedAssets,
          errorMessage: r.errorMessage ?? undefined,
          createdAt: r.createdAt.toISOString(),
          completedAt: r.completedAt?.toISOString(),
        })),
      };

      // Revenue source of truth: Stripe SUCCEEDED charges. Every payment produces a
      // charge — one-time downloads AND every subscription invoice (the initial one
      // plus all monthly renewals). checkout.sessions alone miss renewals because a
      // recurring billing cycle never creates a new checkout session, so subscription
      // revenue after month one was previously invisible.
      interface ChargeEntry {
        id: string;
        amount: number;
        currency: string;
        description: string;
        created: number;
        status: string;
        email: string | null;
        mode: string;
      }

      const netAmount = (c: any): number =>
        (c.amount_captured ?? c.amount ?? 0) - (c.amount_refunded ?? 0);
      const chargeEmail = (c: any): string | null => {
        if (c.billing_details?.email) return c.billing_details.email;
        if (c.customer && typeof c.customer === "object" && !c.customer.deleted) {
          return c.customer.email ?? null;
        }
        return null;
      };

      let totalRevenue = 0;
      let activeSubscribers = 0;
      let monthlyRevenue = 0;
      let recentCharges: ChargeEntry[] = [];
      let revenueLoaded = false;
      let subsLoaded = false;

      // Revenue from every succeeded charge: one-time downloads AND every subscription
      // invoice (initial + renewals). charges.list returns newest-first, so the first
      // 50 succeeded charges are the most recent — we keep those for the activity list
      // while continuing to sum all charges for an accurate lifetime total.
      try {
        const stripe = await getUncachableStripeClient();
        let scanned = 0;
        for await (const c of stripe.charges.list({ limit: 100, expand: ["data.customer"] })) {
          scanned++;
          if (c.status === "succeeded" && c.paid) {
            const amount = netAmount(c);
            if (amount > 0) {
              const isSub = !!(c as any).invoice;
              totalRevenue += amount;
              if (recentCharges.length < 50) {
                recentCharges.push({
                  id: c.id,
                  amount,
                  currency: c.currency ?? "usd",
                  description: isSub ? "Subscription payment" : "One-time download",
                  created: c.created,
                  status: "succeeded",
                  email: chargeEmail(c),
                  mode: isSub ? "subscription" : "payment",
                });
              }
            }
          }
          if (scanned >= 50000) {
            console.warn("Admin revenue: hit 50000-charge scan bound; totalRevenue may undercount.");
            break; // hard safety bound against runaway pagination
          }
        }
        revenueLoaded = true;
      } catch (stripeErr) {
        console.warn("Could not fetch Stripe charges for admin revenue:", stripeErr);
      }

      // True MRR + active subscriber count from currently-active subscriptions,
      // normalised to a monthly amount regardless of billing interval.
      try {
        const stripe = await getUncachableStripeClient();
        for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100 })) {
          activeSubscribers++;
          for (const item of sub.items.data) {
            const unit = item.price.unit_amount ?? 0;
            const qty = item.quantity ?? 1;
            const count = item.price.recurring?.interval_count ?? 1;
            const line = unit * qty;
            switch (item.price.recurring?.interval) {
              case "year": monthlyRevenue += line / (12 * count); break;
              case "week": monthlyRevenue += (line * 52) / (12 * count); break;
              case "day": monthlyRevenue += (line * 365) / (12 * count); break;
              default: monthlyRevenue += line / count; // monthly
            }
          }
          if (activeSubscribers >= 5000) break;
        }
        monthlyRevenue = Math.round(monthlyRevenue);
        subsLoaded = true;
      } catch (stripeErr) {
        console.warn("Could not fetch Stripe subscriptions for admin stats:", stripeErr);
      }

      // Per-metric fallback: for whatever Stripe couldn't provide, derive figures from
      // our own payments table so the dashboard still shows historical data.
      if (!revenueLoaded || !subsLoaded) {
        const dbPayments = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);
        const dbCharges: ChargeEntry[] = dbPayments.map(p => ({
          id: p.stripeSessionId ?? String(p.id),
          amount: p.amountCents,
          currency: p.currency,
          description: p.mode === "subscription" ? "Subscription payment" : "One-time download",
          created: Math.floor(p.createdAt.getTime() / 1000),
          status: "succeeded",
          email: p.customerEmail ?? null,
          mode: p.mode,
        }));
        if (!revenueLoaded) {
          recentCharges = dbCharges;
          totalRevenue = dbCharges.reduce((s, c) => s + c.amount, 0);
        }
        if (!subsLoaded) {
          activeSubscribers = dbCharges.filter(c => c.mode === "subscription").length;
          monthlyRevenue = dbCharges
            .filter(c => c.mode === "subscription")
            .reduce((s, c) => s + c.amount, 0);
        }
      }

      // Fetch failed charges from Stripe
      interface FailedPaymentEntry {
        id: string;
        amount: number;
        currency: string;
        created: number;
        email: string | null;
        failureCode: string | null;
        failureMessage: string | null;
        outcome: string | null;
      }
      const failedPayments: FailedPaymentEntry[] = [];
      try {
        const stripe = await getUncachableStripeClient();
        const failedCharges = await stripe.charges.list({ limit: 50 });
        for (const c of failedCharges.data) {
          if (c.status !== "failed") continue;
          failedPayments.push({
            id: c.id,
            amount: c.amount,
            currency: c.currency,
            created: c.created,
            email: c.billing_details?.email ?? null,
            failureCode: c.failure_code ?? null,
            failureMessage: c.failure_message ?? null,
            outcome: (c.outcome as any)?.seller_message ?? (c.outcome as any)?.reason ?? null,
          });
        }
        failedPayments.sort((a, b) => b.created - a.created);
      } catch (stripeErr) {
        console.warn("Could not fetch failed charges:", stripeErr);
      }

      res.json({
        analytics,
        stripe: {
          activeSubscribers,
          monthlyRevenue,
          totalRevenue,
          recentCharges,
          failedPayments,
        },
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  return httpServer;
}
