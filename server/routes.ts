import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import { storage } from "./storage";
import { scrapeWebsite, cleanupScrapeFiles } from "./scraper";
import { startScrapeSchema, scrapeAnalytics, payments, users } from "@shared/schema";
import type { Asset, ScrapeProgress, ScrapeJob, User } from "@shared/schema";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql, desc, count, sum, eq } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, registerAuthRoutes, getUserById } from "./auth";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Job ownership: jobId -> userId. Jobs live in memory, so this map matches
  // their lifetime. Enforced on job status reads and downloads.
  const jobOwners = new Map<string, number>();

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

  registerAuthRoutes(app);

  // Check whether a user has an active subscription. Links the Stripe customer
  // to the user record on first successful lookup by email.
  async function userHasActiveSubscription(user: User): Promise<boolean> {
    try {
      const stripe = await getUncachableStripeClient();
      if (user.stripeCustomerId) {
        const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "active", limit: 1 });
        if (subs.data.length > 0) return true;
      }
      const customers = await stripe.customers.list({ email: user.email, limit: 5 });
      for (const customer of customers.data) {
        if (customer.id === user.stripeCustomerId) continue;
        const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 1 });
        if (subs.data.length > 0) {
          await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("Subscription check failed:", err);
      return false;
    }
  }

  app.post("/api/scrape", requireAuth, async (req, res) => {
    try {
      const validatedData = startScrapeSchema.parse(req.body);

      if (isAdultUrl(validatedData.url)) {
        return res.status(400).json({
          message: "We do not back up adult websites.",
        });
      }

      const user = await getUserById(req.session.userId!);
      if (!user) {
        return res.status(401).json({ message: "Please sign in to continue" });
      }

      // Determine how this scrape is paid for: subscription > free scrape > credit.
      // Free-scrape and credit consumption are both atomic conditional updates,
      // so concurrent requests can't double-spend either entitlement.
      let paidWith: "subscription" | "free" | "credit";
      if (await userHasActiveSubscription(user)) {
        paidWith = "subscription";
      } else {
        const claimedFree = await db
          .update(users)
          .set({ freeScrapeUsed: true })
          .where(sql`${users.id} = ${user.id} AND ${users.freeScrapeUsed} = false`)
          .returning({ id: users.id });
        if (claimedFree.length > 0) {
          paidWith = "free";
        } else {
          const updated = await db
            .update(users)
            .set({ credits: sql`${users.credits} - 1` })
            .where(sql`${users.id} = ${user.id} AND ${users.credits} > 0`)
            .returning({ credits: users.credits });
          if (updated.length === 0) {
            return res.status(402).json({
              message: "You're out of credits. Buy a credit pack or subscribe for unlimited scrapes.",
              code: "NO_CREDITS",
            });
          }
          paidWith = "credit";
        }
      }

      const job = await storage.createJob(validatedData.url);
      // Scrape is paid for upfront, so the download is included.
      storage.authorizeDownload(job.id, `user_${user.id}_${job.id}`);
      jobOwners.set(job.id, user.id);

      // Refund the free scrape or credit if the job fails outright.
      const refundOnFailure = async () => {
        try {
          if (paidWith === "free") {
            await db.update(users).set({ freeScrapeUsed: false }).where(eq(users.id, user.id));
          } else if (paidWith === "credit") {
            await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, user.id));
          }
        } catch (e) {
          console.error("Refund failed:", e);
        }
      };
      
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
            jobOwners.delete(job.id);
          }, TTL_MS);

          // Re-fetch job so expiresAt is included in the broadcast
          const jobWithExpiry = await storage.getJob(job.id);
          broadcast(job.id, { type: "complete", job: jobWithExpiry ?? completedJob });
          
        } catch (error) {
          console.error("Scrape error:", error);
          const errMsg = error instanceof Error ? error.message : "Scraping failed";
          await storage.updateJobStatus(job.id, "failed");
          await storage.updateJobProgress(job.id, { errorMessage: errMsg });

          // Give the credit / free scrape back — the user got nothing.
          await refundOnFailure();

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
  
  app.get("/api/scrape/:id", requireAuth, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      const owner = jobOwners.get(req.params.id);
      if (owner !== undefined && owner !== req.session.userId) {
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

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const { priceId, jobId } = req.body;
      if (!priceId || !jobId) {
        return res.status(400).json({ message: "Missing priceId or jobId" });
      }

      const job = await storage.getJob(jobId);
      if (!job || job.status !== "completed") {
        return res.status(400).json({ message: "Job not found or not completed" });
      }

      const stripe = await getUncachableStripeClient();
      const price = await stripe.prices.retrieve(priceId);
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

  // Checkout for credit packs or the unlimited subscription — no job required,
  // credits/subscription are attached to the signed-in account.
  app.post("/api/stripe/checkout-plan", requireAuth, async (req, res) => {
    try {
      const { priceId } = req.body;
      if (!priceId) {
        return res.status(400).json({ message: "Missing priceId" });
      }
      const user = await getUserById(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Please sign in" });

      const stripe = await getUncachableStripeClient();
      const price = await stripe.prices.retrieve(priceId);
      const mode = price.recurring ? "subscription" : "payment";
      const creditAmount = price.metadata?.credits ? parseInt(price.metadata.credits, 10) : 0;

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode,
        customer_email: user.stripeCustomerId ? undefined : user.email,
        customer: user.stripeCustomerId ?? undefined,
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=1`,
        cancel_url: `${baseUrl}/checkout/cancel`,
        metadata: {
          app: "websucker",
          userId: String(user.id),
          ...(creditAmount > 0 ? { type: "credits", credits: String(creditAmount) } : { type: "subscription" }),
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Plan checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Verify a plan purchase (credits or subscription) and apply it to the account.
  // Idempotent: the payments table records each session once.
  app.get("/api/stripe/verify-plan", requireAuth, async (req, res) => {
    try {
      const { session_id } = req.query;
      if (!session_id || typeof session_id !== "string") {
        return res.status(400).json({ paid: false, message: "Missing session_id" });
      }
      const user = await getUserById(req.session.userId!);
      if (!user) return res.status(401).json({ paid: false });

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== "paid") {
        return res.json({ paid: false });
      }

      // The checkout session must belong to the signed-in user — otherwise
      // anyone with a session_id could claim someone else's purchase.
      if (
        session.metadata?.app !== "websucker" ||
        session.metadata?.userId !== String(user.id)
      ) {
        return res.status(403).json({ paid: false, message: "This purchase belongs to a different account" });
      }

      // Idempotency guard — only grant once per checkout session.
      const inserted = await db
        .insert(payments)
        .values({
          stripeSessionId: session_id,
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          customerEmail: session.customer_details?.email ?? user.email,
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
          mode: session.mode ?? "payment",
          jobId: null,
        })
        .onConflictDoNothing()
        .returning({ id: payments.id });

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const updates: Record<string, any> = {};
      if (customerId && customerId !== user.stripeCustomerId) {
        updates.stripeCustomerId = customerId;
      }

      const creditAmount = session.metadata?.credits ? parseInt(session.metadata.credits, 10) : 0;
      if (inserted.length > 0 && creditAmount > 0) {
        updates.credits = sql`${users.credits} + ${creditAmount}`;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, user.id));
      }

      const freshUser = await getUserById(user.id);
      res.json({
        paid: true,
        type: session.metadata?.type ?? (session.mode === "subscription" ? "subscription" : "credits"),
        creditsAdded: inserted.length > 0 ? creditAmount : 0,
        credits: freshUser?.credits ?? user.credits,
      });
    } catch (error) {
      console.error("Plan verification error:", error);
      res.status(500).json({ paid: false, message: "Verification failed" });
    }
  });

  app.get("/api/stripe/verify-payment", async (req, res) => {
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

  app.post("/api/stripe/authorize-subscriber-download", async (req, res) => {
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

      const owner = jobOwners.get(req.params.id);
      if (owner !== undefined && owner !== req.session.userId) {
        return res.status(404).json({ message: "Job not found" });
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
      fileStream.pipe(res);
      
      fileStream.on("end", () => {
        setTimeout(async () => {
          await cleanupScrapeFiles(job.id);
          await storage.deleteJob(job.id);
          jobOwners.delete(job.id);
        }, 5000);
      });
      
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Download failed" });
    }
  });

  app.post("/api/stripe/customer-lookup", async (req, res) => {
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
  app.get("/api/admin/access-codes", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json({ codes: await storage.listAccessCodes() });
  });

  app.post("/api/admin/access-codes", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { note, maxUses } = req.body;
    const code = await storage.createAccessCode(note || "", maxUses ?? null);
    res.json({ code });
  });

  app.delete("/api/admin/access-codes/:code", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const deleted = await storage.deleteAccessCode(req.params.code);
    res.json({ deleted });
  });

  // Redeem an access code to authorize a download
  app.post("/api/access-code/redeem", async (req, res) => {
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

  app.get("/api/admin/stats", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret || secret !== adminSecret) {
      return res.status(401).json({ message: "Unauthorized" });
    }

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
