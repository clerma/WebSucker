import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import { storage } from "./storage";
import { scrapeWebsite, cleanupScrapeFiles } from "./scraper";
import { startScrapeSchema, scrapeAnalytics } from "@shared/schema";
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

      const stripe = await getUncachableStripeClient();

      const [subscriptions, paymentIntents] = await Promise.all([
        stripe.subscriptions.list({ status: "active", limit: 100 }),
        stripe.paymentIntents.list({ limit: 20 }),
      ]);

      const activeSubscribers = subscriptions.data.length;

      const monthlyRevenue = subscriptions.data.reduce((sum, sub) => {
        const item = sub.items.data[0];
        return sum + (item?.price.unit_amount ?? 0);
      }, 0);

      const succeededPayments = paymentIntents.data.filter((p) => p.status === "succeeded");

      const totalRevenue = succeededPayments.reduce((sum, p) => sum + p.amount, 0);

      const recentCharges = succeededPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        description: p.description,
        created: p.created,
        status: p.status,
        email: p.receipt_email ?? null,
      }));

      res.json({
        analytics,
        stripe: {
          activeSubscribers,
          monthlyRevenue,
          totalRevenue,
          recentCharges,
        },
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  return httpServer;
}
