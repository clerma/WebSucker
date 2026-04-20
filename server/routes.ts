import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import { storage } from "./storage";
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
              ws.send(JSON.stringify({ type: "error", message: "Scraping failed." }));
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
  
  app.post("/api/scrape", async (req, res) => {
    try {
      const validatedData = startScrapeSchema.parse(req.body);
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
          await storage.updateJobStatus(job.id, "failed");
          const errMsg = error instanceof Error ? error.message : "Scraping failed";

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

      // Read payments from our own DB (persisted since we added DB tracking)
      const dbPayments = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50);

      // Also fetch recent completed checkout sessions directly from Stripe so historical
      // payments (before DB tracking was added) still appear in the dashboard.
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
      const stripeCharges: ChargeEntry[] = [];
      try {
        const stripe = await getUncachableStripeClient();
        const sessions = await stripe.checkout.sessions.list({
          limit: 50,
          expand: ["data.customer"],
        });
        for (const s of sessions.data) {
          if (s.payment_status !== "paid") continue;
          stripeCharges.push({
            id: s.id,
            amount: s.amount_total ?? 0,
            currency: s.currency ?? "usd",
            description: s.mode === "subscription" ? "Monthly subscription" : "One-time download",
            created: s.created,
            status: "succeeded",
            email: s.customer_details?.email ?? null,
            mode: s.mode ?? "payment",
          });
        }
      } catch (stripeErr) {
        console.warn("Could not fetch Stripe sessions for admin stats:", stripeErr);
      }

      // Merge DB records and Stripe records, preferring DB (dedup by session id)
      const dbSessionIds = new Set(dbPayments.map(p => p.stripeSessionId).filter(Boolean));
      const mergedCharges: ChargeEntry[] = [
        ...dbPayments.map(p => ({
          id: p.stripeSessionId ?? String(p.id),
          amount: p.amountCents,
          currency: p.currency,
          description: p.mode === "subscription" ? "Monthly subscription" : "One-time download",
          created: Math.floor(p.createdAt.getTime() / 1000),
          status: "succeeded",
          email: p.customerEmail ?? null,
          mode: p.mode,
        })),
        ...stripeCharges.filter(c => !dbSessionIds.has(c.id)),
      ].sort((a, b) => b.created - a.created).slice(0, 50);

      const totalRevenue = mergedCharges.reduce((s, c) => s + c.amount, 0);
      const activeSubscribers = mergedCharges.filter(c => c.mode === "subscription").length;
      const monthlyRevenue = mergedCharges
        .filter(c => c.mode === "subscription")
        .reduce((s, c) => s + c.amount, 0);

      const recentCharges = mergedCharges;

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
