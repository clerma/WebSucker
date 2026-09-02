import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID, timingSafeEqual } from "crypto";
import * as fs from "fs";
import { storage } from "./storage";
import { configuredOrigins, rateLimit } from "./security";
import { scrapeWebsite, cleanupScrapeFiles } from "./scraper";
import { startScrapeSchema, scrapeAnalytics, payments, users, downloadEvents, securityAuditEvents } from "@shared/schema";
import type { Asset, ScrapeProgress, ScrapeJob, User } from "@shared/schema";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql, desc, count, sum, eq, isNotNull, isNull, lt, or, and } from "drizzle-orm";
import { db } from "./db";
import { requireAuth, registerAuthRoutes, getUserById } from "./auth";
import {
  artifactExists, deleteArtifact, downloadArtifact, parseObjectReference, uploadArtifact,
} from "./artifact-storage";

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

function publicJobSnapshot(job: ScrapeJob) {
  const { downloadPath: _downloadPath, ...safeJob } = job;
  return safeJob;
}

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

// Shared rate limiters for abuse-prone endpoints.
const scrapeLimiter = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: "scrape", message: "Too many scrape requests. Please wait a minute and try again." });
const redeemLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "redeem", message: "Too many attempts. Please wait a minute and try again.", subject: (req) => typeof req.body?.code === "string" ? req.body.code : null });
const lookupLimiter = rateLimit({ windowMs: 60_000, max: 6, keyPrefix: "lookup", message: "Too many lookups. Please wait a minute and try again.", subject: (req) => typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : null });
const adminLimiter = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "admin", message: "Too many requests." });
const paymentLimiter = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "payment", message: "Too many requests. Please wait a moment." });
const paymentVerificationLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 15,
  keyPrefix: "payment_verify",
  message: "Too many verification attempts. Please wait and try again.",
  subject: (req) => typeof req.body?.session_id === "string" ? req.body.session_id : null,
});
const subscriptionStatusLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "subscription_status",
  subject: (req) => typeof req.query?.customer_id === "string" ? req.query.customer_id : null,
});
const statusLimiter = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: "status" });
const recoveryLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5, keyPrefix: "scrape_recovery", message: "Too many recovery attempts. Please wait and try again." });
const downloadLimiter = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "download", message: "Too many download attempts. Please wait and try again." });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ noServer: true });
  const applicationBaseUrl = () => {
    if (process.env.APP_BASE_URL) {
      try { return new URL(process.env.APP_BASE_URL).origin; } catch { /* fail below */ }
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_BASE_URL must be configured for checkout redirects");
    }
    const developmentOrigin = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : configuredOrigins().values().next().value as string | undefined;
    const baseUrl = developmentOrigin;
    if (!baseUrl) throw new Error("No trusted application origin is configured");
    return new URL(baseUrl).origin;
  };
  const sessionMiddleware = app.get("sessionMiddleware") as (
    req: Request,
    res: Response,
    next: (err?: unknown) => void,
  ) => void;

  // Send a ping to every connected client every 25 seconds to keep the
  // connection alive through proxies that close idle connections.
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 25000);
  
  httpServer.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") {
      // Vite owns its HMR upgrade path in development. The production server
      // has no other upgrade consumers, so reject unmatched upgrades instead
      // of leaving sockets open indefinitely.
      if (process.env.NODE_ENV === "production") {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
      }
      return;
    }

    sessionMiddleware(request as Request, {} as Response, (err?: unknown) => {
      const userId = (request as Request).session?.userId;
      if (err || !userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  });

  wss.on("connection", (ws, request) => {
    const userId = (request as Request).session.userId!;
    let subscribedJobId: string | null = null;

    const unsubscribe = () => {
      if (!subscribedJobId) return;
      const connections = jobConnections.get(subscribedJobId);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          jobConnections.delete(subscribedJobId);
        }
      }
      subscribedJobId = null;
    };
    
    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "subscribe" && typeof data.jobId === "string") {
          const jobId = data.jobId;
          if (!(await storage.isOwner(jobId, userId))) {
            ws.close(1008, "Not authorized for this scrape job");
            return;
          }

          unsubscribe();
          subscribedJobId = jobId;
          
          if (!jobConnections.has(jobId)) {
            jobConnections.set(jobId, new Set());
          }
          jobConnections.get(jobId)!.add(ws);

          // Send an immediate catch-up snapshot so reconnected clients see
          // the current state without waiting for the next broadcast.
          storage.getJob(jobId).then(async (job) => {
            if (
              !job ||
              !(await storage.isOwner(jobId, userId)) ||
              ws.readyState !== WebSocket.OPEN
            ) return;

            if (job.status === "completed") {
              // Job already done — send complete event right away.
              ws.send(JSON.stringify({ type: "complete", job: publicJobSnapshot(job) }));
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
    
    ws.on("close", unsubscribe);
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

  // Timers are an optimization; this durable sweep recovers expirations after
  // restarts and coordinates deletion with the cleanup lease.
  const cleanupSweep = async () => {
    try {
      await storage.failAbandonedJobs();
      for (const jobId of await storage.listExpiredJobIds()) {
        if (!(await storage.claimCleanup(jobId, 60_000))) continue;
        const expiredJob = await storage.getJob(jobId);
        await deleteArtifact(expiredJob?.downloadPath);
        await cleanupScrapeFiles(jobId);
        await storage.deleteJob(jobId);
      }
    } catch (error) {
      console.error("Expired scrape cleanup failed:", error);
    }
  };
  void cleanupSweep();
  const cleanupInterval = setInterval(cleanupSweep, 60_000);
  cleanupInterval.unref?.();
  wss.on("close", () => clearInterval(cleanupInterval));

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

  // Runs the scrape pipeline for a job in the background: broadcasts progress,
  // completes/fails the job, persists analytics, schedules cleanup.
  async function runScrapeJob(job: ScrapeJob, preclaimedExecutionToken?: string): Promise<boolean> {
      const executionToken = preclaimedExecutionToken ?? randomUUID();
      if (!preclaimedExecutionToken && !(await storage.claimExecution(job.id, executionToken))) return false;
    void (async () => {
      let leaseLost = false;
      let uploadedReference: string | undefined;
      let committedJob: ScrapeJob | undefined;
      let committed = false;
      const renewal = setInterval(async () => {
        try {
          if (!(await storage.renewExecution(job.id, executionToken))) leaseLost = true;
        } catch {
          leaseLost = true;
        }
      }, 15_000);
      renewal.unref?.();

      // Phase 1: crawl, publish the worker-scoped object, and atomically commit
      // its exact reference under the execution fence.
      try {
        const zipPath = await scrapeWebsite({
          jobId: job.id,
          url: job.url,
          onProgress: (progress: ScrapeProgress, asset?: Asset) => {
            broadcast(job.id, { type: "progress", progress });
            if (asset) {
              broadcast(job.id, { type: "asset", asset });
            }
          },
        });

        if (leaseLost) throw new Error("Scrape execution lease was lost");
        uploadedReference = await uploadArtifact(job.id, executionToken, zipPath);
        committedJob = await storage.completeJob(job.id, executionToken, uploadedReference);
        if (!committedJob) {
          // This worker owns only its execution-token-scoped object.
          await deleteArtifact(uploadedReference);
          uploadedReference = undefined;
          await cleanupScrapeFiles(job.id);
          return;
        }
        committed = true;
      } catch (error) {
        console.error("Scrape error:", error);
        const errMsg = error instanceof Error ? error.message : "Scraping failed";
        if (uploadedReference) await deleteArtifact(uploadedReference).catch(console.error);
        const failed = await storage.failExecution(job.id, executionToken, errMsg);
        if (failed) await storage.refundFailedJob(job.id);

        // Free the partial /tmp output immediately so failed jobs don't leak
        // disk. Keep the job record briefly so the client's reconnect poll can
        // still read the failure, then GC it.
        await cleanupScrapeFiles(job.id);
        if (failed) {
          await storage.scheduleExpiry(job.id, async () => {
            await storage.deleteJob(job.id);
          }, 2 * 60 * 1000);
        }

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
      } finally {
        clearInterval(renewal);
      }

      if (!committed || !committedJob) return;

      // Phase 2: the DB row now owns the accepted artifact. Everything below is
      // best effort and must never roll back/fail/delete that committed object.
      if (parseObjectReference(committedJob.downloadPath || "")) {
        try {
          await cleanupScrapeFiles(job.id);
        } catch (error) {
          console.error("Committed scrape local cleanup failed:", error);
        }
      }
      db.insert(scrapeAnalytics).values({
        url: job.url,
        status: "completed",
        totalAssets: committedJob.totalAssets,
        successfulAssets: committedJob.successfulAssets,
        failedAssets: committedJob.failedAssets,
        completedAt: new Date(),
      }).catch((error: unknown) => console.error("Analytics insert failed:", error));

      try {
        await storage.scheduleExpiry(job.id, async () => {
          const expiringJob = await storage.getJob(job.id);
          await deleteArtifact(expiringJob?.downloadPath);
          await cleanupScrapeFiles(job.id);
          await storage.deleteJob(job.id);
        }, 10 * 60 * 1000);
      } catch (error) {
        console.error("Committed scrape expiry scheduling failed:", error);
      }

      try {
        const jobWithExpiry = await storage.getJob(job.id);
        broadcast(job.id, {
          type: "complete",
          job: publicJobSnapshot(jobWithExpiry ?? committedJob),
        });
      } catch (error) {
        console.error("Committed scrape broadcast failed:", error);
      }
    })();
    return true;
  }

  // Strip credentials/query tokens from a URL before persisting it anywhere.
  const sanitizeUrlForLog = (raw: string): string | null => {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 450);
    } catch {
      return null;
    }
  };

  // Best-effort persistent log of download unlocks (never blocks the request).
  // The unique (job_id, method) index makes concurrent writers (e.g. webhook
  // vs. browser verify) idempotent.
  const recordDownloadEvent = (e: { userId?: number | null; userEmail?: string | null; jobId?: string | null; websiteUrl: string; method: string }) => {
    db.insert(downloadEvents).values({
      userId: e.userId ?? null,
      userEmail: e.userEmail ?? null,
      jobId: e.jobId ?? null,
      websiteUrl: sanitizeUrlForLog(e.websiteUrl) ?? "invalid-url",
      method: e.method,
    }).onConflictDoNothing().catch((err) => console.error("Failed to record download event:", err));
  };

  // Best-effort audit trail for entitlement-sensitive actions. Logging never
  // blocks the request, and URLs are stripped of credentials/query tokens.
  const recordSecurityEvent = (
    req: Request,
    e: {
      action: "scrape" | "download";
      outcome: "allowed" | "denied";
      reason: string;
      userId?: number | null;
      userEmail?: string | null;
      jobId?: string | null;
      websiteUrl?: string | null;
      method?: string | null;
    },
  ) => {
    db.insert(securityAuditEvents).values({
      userId: e.userId ?? null,
      userEmail: e.userEmail ?? null,
      jobId: e.jobId ?? null,
      websiteUrl: e.websiteUrl ? sanitizeUrlForLog(e.websiteUrl) : null,
      action: e.action,
      outcome: e.outcome,
      reason: e.reason.slice(0, 120),
      method: e.method ?? null,
      ipAddress: (req.ip || req.socket.remoteAddress || "").slice(0, 64) || null,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300) || null,
    }).catch((err) => console.error("Failed to record security event:", err));
  };

  const auditUnauthenticated = (action: "scrape" | "download") =>
    (req: Request, _res: Response, next: () => void) => {
      if (!req.session?.userId) {
        recordSecurityEvent(req, {
          action,
          outcome: "denied",
          reason: "authentication_required",
          websiteUrl: action === "scrape" && typeof req.body?.url === "string" ? req.body.url : null,
          jobId: action === "download" ? String(req.params.id || "") || null : null,
        });
      }
      next();
    };

  app.post("/api/scrape", scrapeLimiter, auditUnauthenticated("scrape"), requireAuth, async (req, res) => {
    try {
      const validatedData = startScrapeSchema.parse(req.body);

      if (isAdultUrl(validatedData.url)) {
        recordSecurityEvent(req, {
          action: "scrape",
          outcome: "denied",
          reason: "disallowed_site",
          userId: req.session.userId,
          websiteUrl: validatedData.url,
        });
        return res.status(400).json({
          message: "We do not back up adult websites.",
        });
      }

      const user = await getUserById(req.session.userId!);
      if (!user) {
        recordSecurityEvent(req, {
          action: "scrape",
          outcome: "denied",
          reason: "user_not_found",
          userId: req.session.userId,
          websiteUrl: validatedData.url,
        });
        return res.status(401).json({ message: "Please sign in to continue" });
      }

      const subscribed = await userHasActiveSubscription(user);
      const acquired = await storage.createFundedJob(validatedData.url, user.id, subscribed);
      if (!acquired.ok) {
        recordSecurityEvent(req, {
          action: "scrape", outcome: "denied", reason: acquired.reason,
          userId: user.id, userEmail: user.email, websiteUrl: validatedData.url,
        });
        return res.status(acquired.reason === "no_credit" ? 402 : 401).json({
          message: acquired.reason === "no_credit"
            ? "You're out of credits. Buy a credit pack or subscribe for unlimited scrapes."
            : "Please sign in to continue",
          ...(acquired.reason === "no_credit" ? { code: "NO_CREDITS" } : {}),
        });
      }
      const { job, fundingMethod: paidWith } = acquired;
      // Subscription and credit scrapes include the download. The free scrape
      // covers scraping/analysis only — downloading the ZIP requires a credit
      // or subscription (charged at download time).
      if (paidWith !== "free") {
        // Free scrapes don't include the download, so they aren't unlocks;
        // they get logged at download time when a credit/subscription pays.
        recordDownloadEvent({ userId: user.id, userEmail: user.email, jobId: job.id, websiteUrl: job.url, method: paidWith });
      }
      recordSecurityEvent(req, {
        action: "scrape",
        outcome: "allowed",
        reason: "entitlement_verified",
        userId: user.id,
        userEmail: user.email,
        jobId: job.id,
        websiteUrl: job.url,
        method: paidWith,
      });

      // Give the credit / free scrape back if the job fails — the user got nothing.
      void runScrapeJob(job);

      res.json(job);
    } catch (error) {
      console.error("Scrape start error:", error);
      recordSecurityEvent(req, {
        action: "scrape",
        outcome: "denied",
        reason: "invalid_or_failed_start",
        userId: req.session.userId,
        websiteUrl: typeof req.body?.url === "string" ? req.body.url : null,
      });
      res.status(400).json({
        message: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });
  
  app.get("/api/scrape/:id", statusLimiter, requireAuth, async (req, res) => {
    try {
      const jobId = String(req.params.id);
      const job = await storage.getOwnedJob(jobId, req.session.userId!);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(publicJobSnapshot(job));
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

  app.post("/api/stripe/checkout", paymentLimiter, requireAuth, async (req, res) => {
    try {
      const { priceId, jobId } = req.body;
      if (!priceId || typeof priceId !== "string" || !jobId) {
        return res.status(400).json({ message: "Missing priceId or jobId" });
      }

      const job = req.session?.userId
        ? await storage.getOwnedJob(String(jobId), req.session.userId)
        : undefined;
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

      const baseUrl = applicationBaseUrl();

      // Safe for Stripe metadata (500-char value limit) and for storage:
      // strip any embedded credentials and query string, cap the length.
      const websiteForMetadata = (() => {
        try {
          const u = new URL(job.url);
          return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 450);
        } catch {
          return job.url.slice(0, 450);
        }
      })();

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode,
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&job_id=${jobId}`,
        cancel_url: `${baseUrl}/checkout/cancel?job_id=${jobId}`,
        metadata: {
          jobId,
          userId: String(req.session.userId!),
          app: "websucker",
          url: websiteForMetadata,
        },
        payment_intent_data: mode === "payment" ? {
          metadata: { jobId, userId: String(req.session.userId!), app: "websucker", url: websiteForMetadata },
        } : undefined,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Checkout for credit packs or the unlimited subscription — no job required,
  // credits/subscription are attached to the signed-in account.
  app.post("/api/stripe/checkout-plan", paymentLimiter, requireAuth, async (req, res) => {
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

      const baseUrl = applicationBaseUrl();
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
  app.post("/api/stripe/verify-plan", paymentVerificationLimiter, requireAuth, async (req, res) => {
    try {
      const { session_id } = req.body;
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

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const parsedCredits = session.metadata?.credits ? parseInt(session.metadata.credits, 10) : 0;
      const creditAmount = Number.isSafeInteger(parsedCredits) && parsedCredits > 0 ? parsedCredits : 0;
      // The unique payment marker and entitlement grant are one transaction.
      // Whichever browser/webhook transaction wins the unique session insert is
      // the only transaction permitted to add credits.
      const creditsAdded = await db.transaction(async (tx) => {
        const inserted = await tx.insert(payments).values({
          userId: user.id,
          stripeSessionId: session_id,
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          customerEmail: session.customer_details?.email ?? user.email,
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? "usd",
          mode: session.mode ?? "payment",
          jobId: null,
        }).onConflictDoNothing().returning({ id: payments.id });

        // Safe ownership backfill for a legacy webhook-created row.
        await tx.update(payments).set({ userId: user.id })
          .where(and(eq(payments.stripeSessionId, session_id), isNull(payments.userId)));

        const updates: Record<string, any> = {};
        if (customerId && customerId !== user.stripeCustomerId) updates.stripeCustomerId = customerId;
        if (inserted.length > 0 && creditAmount > 0) updates.credits = sql`${users.credits} + ${creditAmount}`;
        if (Object.keys(updates).length > 0) {
          const updated = await tx.update(users).set(updates).where(eq(users.id, user.id))
            .returning({ id: users.id });
          if (!updated.length) throw new Error("Payment recipient no longer exists");
        }
        return inserted.length > 0 ? creditAmount : 0;
      });

      const freshUser = await getUserById(user.id);
      res.json({
        paid: true,
        type: session.metadata?.type ?? (session.mode === "subscription" ? "subscription" : "credits"),
        creditsAdded,
        credits: freshUser?.credits ?? user.credits,
      });
    } catch (error) {
      console.error("Plan verification error:", error);
      res.status(500).json({ paid: false, message: "Verification failed" });
    }
  });

  // A webhook-recorded payment in the payments table is authoritative even
  // when the in-memory authorization was never set (buyer paid but never
  // returned to the success page) or the Stripe session lookup fails.
  // Note: jobs themselves are in-memory, so this covers the lifetime of the
  // job process — durable job/artifact persistence is tracked separately.
  async function authorizeFromPersistedPayment(jobId: string): Promise<boolean> {
    try {
      const rows = await db
        .select({ id: payments.id, sessionId: payments.stripeSessionId })
        .from(payments)
        .where(eq(payments.jobId, jobId))
        .limit(1);
      if (rows.length === 0) return false;
      await storage.authorizeDownload(jobId, rows[0].sessionId ?? `payment_${rows[0].id}_${jobId}`);
      return true;
    } catch (e) {
      console.error("Persisted payment lookup failed:", e);
      return false;
    }
  }

  app.post("/api/stripe/verify-payment", paymentVerificationLimiter, requireAuth, async (req, res) => {
    try {
      const { session_id } = req.body;
      if (!session_id || typeof session_id !== "string") {
        return res.status(400).json({ paid: false, message: "Missing session_id" });
      }

      // Fallback first: if the webhook already persisted this payment, honor
      // it without needing Stripe or the in-memory session state. Re-visits
      // of the success page re-authorize the same paid job.
      const persisted = await db
        .select()
        .from(payments)
        .where(eq(payments.stripeSessionId, session_id))
        .limit(1);
      if (persisted.length > 0 && persisted[0].jobId) {
        const p = persisted[0];
        if (p.userId !== null && p.userId !== req.session.userId!) {
          return res.status(403).json({ paid: false, message: "This purchase belongs to a different account" });
        }
        if (!(await storage.isOwner(p.jobId!, req.session.userId!))) {
          return res.status(404).json({ paid: false, message: "Job not found" });
        }
        if (p.userId === null) {
          await db.update(payments).set({ userId: req.session.userId! })
            .where(and(eq(payments.id, p.id), isNull(payments.userId)));
        }
        await storage.authorizeDownload(p.jobId!, session_id);
        return res.json({
          paid: true,
          jobId: p.jobId,
          customerEmail: p.customerEmail,
          isSubscription: p.mode === "subscription",
          customerId: null,
        });
      }

      if (await storage.isSessionConsumed(session_id)) {
        return res.status(400).json({ paid: false, message: "Session already used" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status === "paid" && session.metadata?.jobId) {
        const jobId = session.metadata.jobId;
        if (!(await storage.isOwner(jobId, req.session.userId!))) {
          return res.status(404).json({ paid: false, message: "Job not found" });
        }

        await storage.authorizeDownload(jobId, session_id);

        // Persist payment record to DB (survives key changes)
        try {
          await db.insert(payments).values({
            userId: req.session.userId!,
            stripeSessionId: session_id,
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            customerEmail: session.customer_details?.email ?? null,
            amountCents: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            mode: session.mode ?? "payment",
            jobId,
            websiteUrl: session.metadata?.url ?? null,
          }).onConflictDoNothing();
          await db.update(payments).set({ userId: req.session.userId! })
            .where(and(eq(payments.stripeSessionId, session_id), isNull(payments.userId)));
          const paidJob = await storage.getJob(jobId);
          recordDownloadEvent({
            userEmail: session.customer_details?.email ?? null,
            jobId,
            websiteUrl: paidJob?.url ?? session.metadata?.url ?? "unknown",
            method: "payment",
          });
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

  app.get("/api/stripe/check-subscription", subscriptionStatusLimiter, async (req, res) => {
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

  app.get("/api/scrape/:id/download", (_req, res) => {
    res.status(405).json({ message: "Use the download button in the app" });
  });

  app.post("/api/scrape/:id/download", downloadLimiter, auditUnauthenticated("download"), requireAuth, async (req, res) => {
    try {
      const jobId = String(req.params.id);
      const requestUser = await getUserById(req.session.userId!);
      const job = await storage.getJob(jobId);
      if (!job) {
        recordSecurityEvent(req, {
          action: "download",
          outcome: "denied",
          reason: "job_not_found",
          userId: req.session.userId,
          userEmail: requestUser?.email,
          jobId,
        });
        return res.status(404).json({ message: "Job not found" });
      }
      if (job.status !== "completed" || !job.downloadPath) {
        recordSecurityEvent(req, {
          action: "download",
          outcome: "denied",
          reason: "download_not_ready",
          userId: req.session.userId,
          userEmail: requestUser?.email,
          jobId,
          websiteUrl: job.url,
        });
        return res.status(400).json({ message: "Download not ready" });
      }

      const ownerMatches = await storage.isOwner(jobId, req.session.userId!);
      if (!ownerMatches) {
        recordSecurityEvent(req, {
          action: "download",
          outcome: "denied",
          reason: "owner_mismatch",
          userId: req.session.userId,
          userEmail: requestUser?.email,
          jobId,
          websiteUrl: job.url,
        });
        return res.status(404).json({ message: "Job not found" });
      }

      // Verify the artifact exists BEFORE any charging, so a user is never
      // charged for a file that can't be served.
      try {
        if (!(await artifactExists(job.downloadPath))) throw new Error("missing");
        if (!parseObjectReference(job.downloadPath) && process.env.NODE_ENV === "production") {
          throw new Error("legacy local artifact unavailable");
        }
        if (!parseObjectReference(job.downloadPath)) await fs.promises.access(job.downloadPath);
      } catch {
        recordSecurityEvent(req, {
          action: "download",
          outcome: "denied",
          reason: "artifact_missing",
          userId: requestUser?.id,
          userEmail: requestUser?.email,
          jobId,
          websiteUrl: job.url,
        });
        return res.status(404).json({ message: "Download file not found" });
      }

      let authorized = await storage.isDownloadAuthorized(job.id);
      let authorizationMethod = authorized ? "preauthorized" : null;
      // Webhook-recorded payments authorize the download even if the buyer
      // never returned to the success page (paid, closed the tab).
      if (!authorized) {
        await authorizeFromPersistedPayment(job.id);
        authorized = await storage.isDownloadAuthorized(job.id);
        if (authorized) authorizationMethod = "payment";
      }

      if (!authorized) {
        // Free scrapes don't include the download — try to pay for it now
        // with a subscription or a credit. A per-job in-flight lock makes the
        // charge single-consumer so concurrent requests can't double-charge.
        const chargingToken = await storage.claimCharging(job.id);
        if (!chargingToken) {
          recordSecurityEvent(req, {
            action: "download",
            outcome: "denied",
            reason: "authorization_in_progress",
            userId: requestUser?.id,
            userEmail: requestUser?.email,
            jobId,
            websiteUrl: job.url,
          });
          return res.status(409).json({ message: "Download is already being prepared — try again in a moment." });
        }
        try {
          const user = requestUser;
          if (!user || !ownerMatches) {
            recordSecurityEvent(req, {
              action: "download",
              outcome: "denied",
              reason: "payment_required",
              userId: req.session.userId,
              userEmail: user?.email,
              jobId,
              websiteUrl: job.url,
            });
            return res.status(402).json({ message: "Payment required" });
          }
          // Re-check after acquiring the lock — another request may have
          // authorized the job while we were waiting.
          if (!(await storage.isDownloadAuthorized(job.id))) {
            if (await userHasActiveSubscription(user)) {
              await storage.authorizeDownload(job.id, `user_${user.id}_${job.id}`);
              authorizationMethod = "subscription";
              recordDownloadEvent({ userId: user.id, userEmail: user.email, jobId: job.id, websiteUrl: job.url, method: "subscription" });
            } else {
              const charge = await storage.chargeCreditAndAuthorize(
                job.id, user.id, `user_${user.id}_${job.id}`, chargingToken,
              );
              if (charge === "no_credit") {
                recordSecurityEvent(req, {
                  action: "download",
                  outcome: "denied",
                  reason: "no_credits",
                  userId: user.id,
                  userEmail: user.email,
                  jobId,
                  websiteUrl: job.url,
                });
                return res.status(402).json({
                  message: "Downloading requires a credit. Buy a credit pack or subscribe for unlimited scrapes.",
                  code: "NO_CREDITS",
                });
              }
              if (charge !== "authorized") {
                return res.status(409).json({ message: "Download authorization expired. Please try again." });
              }
              authorizationMethod = "credit";
              recordDownloadEvent({ userId: user.id, userEmail: user.email, jobId: job.id, websiteUrl: job.url, method: "credit" });
            }
          }
        } finally {
          await storage.releaseCharging(job.id, chargingToken);
        }
      }

      // Cancel the 10-minute expiry timer so it doesn't delete files mid-download
      storage.cancelExpiry(job.id);
      storage.recordDownload();
      recordSecurityEvent(req, {
        action: "download",
        outcome: "allowed",
        reason: "authorized_stream_started",
        userId: requestUser?.id,
        userEmail: requestUser?.email,
        jobId,
        websiteUrl: job.url,
        method: authorizationMethod ?? "authorized",
      });
      
      const hostname = new URL(job.url).hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="website-sucker-${hostname}.zip"`
      );
      
      const fileStream = downloadArtifact(job.downloadPath) ?? fs.createReadStream(job.downloadPath);

      // Clean up exactly once, whether the download finishes, errors, or the
      // client aborts mid-stream. Previously only "end" was handled, so an
      // aborted download (with the expiry timer already cancelled above) leaked
      // the temp files and job until process restart.
      let cleanedUp = false;
      const finalizeDownload = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        setTimeout(async () => {
          if (await storage.claimCleanup(job.id, 60_000)) {
            await deleteArtifact(job.downloadPath);
            await cleanupScrapeFiles(job.id);
            await storage.deleteJob(job.id);
          }
        }, 5000);
      };

      fileStream.on("error", (err: Error) => {
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
      recordSecurityEvent(req, {
        action: "download",
        outcome: "denied",
        reason: "download_failed",
        userId: req.session.userId,
        jobId: String(req.params.id || "") || null,
      });
      res.status(500).json({ message: "Download failed" });
    }
  });

  // After a server restart, in-memory jobs and their ZIP files are gone but
  // the payment record survives. Recover a paid download by re-scraping the
  // purchased URL for free, with the download pre-authorized.
  app.post("/api/scrape/:id/recover", recoveryLimiter, requireAuth, async (req, res) => {
    try {
      const requestedJobId = String(req.params.id);
      // If the job still exists, no recovery needed — return it as-is.
      const existing = await storage.getOwnedJob(requestedJobId, req.session.userId!);
      if (existing) {
        return res.json({ job: publicJobSnapshot(existing), recovered: false });
      }

      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.jobId, requestedJobId))
        .limit(1);
      if (rows.length === 0 || !rows[0].websiteUrl) {
        return res.status(404).json({ message: "No paid backup found for this download" });
      }
      const payment = rows[0];

      const user = await getUserById(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Please sign in to continue" });

      if (payment.userId !== null && payment.userId !== user.id) {
        return res.status(403).json({ message: "This purchase belongs to a different account" });
      }
      if (payment.userId === null && !payment.customerEmail) {
        return res.status(403).json({ message: "This legacy purchase cannot be linked to an account" });
      }
      if (payment.userId === null &&
          payment.customerEmail!.toLowerCase() !== user.email.toLowerCase()) {
        return res.status(403).json({ message: "This purchase belongs to a different account" });
      }

      const recoveryLeaseUntil = new Date(Date.now() + 5 * 60_000);
      const claimed = await db.update(payments).set({
        recoveryLeaseUntil,
        // Atomically bind verified legacy email rows as part of the claim.
        userId: user.id,
      }).where(and(
        eq(payments.id, payment.id),
        eq(payments.jobId, requestedJobId),
        or(isNull(payments.recoveryLeaseUntil), lt(payments.recoveryLeaseUntil, new Date())),
        or(isNull(payments.userId), eq(payments.userId, user.id)),
      )).returning({ id: payments.id });
      if (claimed.length === 0) {
        return res.status(409).json({ message: "Recovery already in progress — try again in a moment." });
      }

      let job: ScrapeJob | undefined;
      try {
        job = await storage.createJob(payment.websiteUrl!, user.id, "payment");
        await storage.authorizeDownload(job.id, `recovered_${payment.id}_${job.id}`);
        const executionToken = randomUUID();
        if (!(await storage.claimExecution(job.id, executionToken))) {
          throw new Error("Could not claim recovered scrape execution");
        }
        const finalized = await db.update(payments).set({
          jobId: job.id,
          userId: user.id,
          recoveryLeaseUntil: null,
        }).where(and(
          eq(payments.id, payment.id),
          eq(payments.jobId, requestedJobId),
          eq(payments.recoveryLeaseUntil, recoveryLeaseUntil),
          eq(payments.userId, user.id),
        )).returning({ id: payments.id });
        if (finalized.length === 0) throw new Error("Recovery claim was lost");
        await runScrapeJob(job, executionToken);
        res.json({ job: publicJobSnapshot(job), recovered: true });
      } catch (error) {
        if (job) await storage.deleteJob(job.id).catch(console.error);
        await db.update(payments).set({ recoveryLeaseUntil: null })
          .where(and(
            eq(payments.id, payment.id),
            eq(payments.jobId, requestedJobId),
            eq(payments.recoveryLeaseUntil, recoveryLeaseUntil),
          )).catch(console.error);
        throw error;
      }
    } catch (error) {
      console.error("Download recovery error:", error);
      res.status(500).json({ message: "Recovery failed" });
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

  // Redeem an access code. With a jobId it authorizes that job's download;
  // without one it grants the signed-in user 1 credit.
  app.post("/api/access-code/redeem", redeemLimiter, requireAuth, async (req, res) => {
    const { code, jobId } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ success: false, message: "Code is required" });
    }
    // Validate the job BEFORE consuming the code so an invalid job never
    // burns a redemption.
    if (jobId) {
      const job = await storage.getJob(jobId);
      const ownerMatches = await storage.isOwner(jobId, req.session.userId!);
      if (!job || job.status !== "completed" || !ownerMatches) {
        return res.status(400).json({ success: false, message: "This code can't be applied to that download" });
      }
    }
    const valid = await storage.redeemAccessCode(code);
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid or expired access code" });
    }
    if (jobId) {
      await storage.authorizeDownload(jobId, `code:${code}:${jobId}`);
      const job = await storage.getJob(jobId);
      const user = await getUserById(req.session.userId!);
      if (job) {
        recordDownloadEvent({ userId: req.session.userId, userEmail: user?.email, jobId, websiteUrl: job.url, method: "access_code" });
      }
      return res.json({ success: true, granted: "download" });
    }
    await db
      .update(users)
      .set({ credits: sql`${users.credits} + 1` })
      .where(eq(users.id, req.session.userId!));
    res.json({ success: true, granted: "credit" });
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
        website: string | null;
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
      // Map Stripe payment intents -> scraped website URL via our payments table,
      // so each order in the admin list shows which site was purchased.
      const urlByPaymentIntent = new Map<string, string>();
      try {
        const paymentRows = await db.select({
          pi: payments.stripePaymentIntentId,
          url: payments.websiteUrl,
        }).from(payments).where(isNotNull(payments.websiteUrl));
        for (const row of paymentRows) {
          if (row.pi && row.url) urlByPaymentIntent.set(row.pi, row.url);
        }
      } catch (e) {
        console.warn("Could not load payment->website map:", e);
      }

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
                  // Stripe doesn't copy PI metadata onto the charge, so the
                  // payments-table join (by payment_intent) is the source of truth.
                  website: (typeof c.payment_intent === "string" ? urlByPaymentIntent.get(c.payment_intent) : undefined) ?? null,
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
          website: p.websiteUrl ?? null,
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

      // Recent download unlocks: who unlocked which website and how.
      let recentDownloads: Array<{ email: string | null; website: string; method: string; createdAt: string }> = [];
      try {
        const rows = await db.select().from(downloadEvents).orderBy(desc(downloadEvents.createdAt)).limit(50);
        recentDownloads = rows.map(r => ({
          email: r.userEmail,
          website: r.websiteUrl,
          method: r.method,
          createdAt: r.createdAt.toISOString(),
        }));
      } catch (e) {
        console.warn("Could not load download events:", e);
      }

      let recentSecurityEvents: Array<{
        id: number;
        email: string | null;
        jobId: string | null;
        website: string | null;
        action: string;
        outcome: string;
        reason: string;
        method: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: string;
      }> = [];
      try {
        const rows = await db
          .select()
          .from(securityAuditEvents)
          .orderBy(desc(securityAuditEvents.createdAt))
          .limit(100);
        recentSecurityEvents = rows.map(r => ({
          id: r.id,
          email: r.userEmail,
          jobId: r.jobId,
          website: r.websiteUrl,
          action: r.action,
          outcome: r.outcome,
          reason: r.reason,
          method: r.method,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          createdAt: r.createdAt.toISOString(),
        }));
      } catch (e) {
        console.warn("Could not load security audit events:", e);
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
        recentDownloads,
        recentSecurityEvents,
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  return httpServer;
}
