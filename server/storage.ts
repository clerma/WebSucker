import { randomBytes, randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import type { Asset, ScrapeJob, ScrapeStatus } from "@shared/schema";
import { accessCodes as accessCodesTable, downloadEvents, scrapeJobs, users } from "@shared/schema";
import { db } from "./db";
import { and, eq, gt, isNull, lte, lt, or, sql } from "drizzle-orm";

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const generateAccessCode = () => {
  const bytes = randomBytes(10);
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % 32];
  return `WS-${out.slice(0, 5)}-${out.slice(5, 10)}`;
};

export interface AccessCode {
  code: string;
  note: string;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

export interface AnalyticsData {
  totalJobsCreated: number;
  totalAssetsScraped: number;
  totalDownloads: number;
  uniqueUrlsScraped: string[];
  recentJobs: Array<{
    id: string; url: string; status: ScrapeStatus; totalAssets: number;
    successfulAssets: number; failedAssets: number; errorMessage?: string;
    createdAt: string; completedAt?: string;
  }>;
}

type FundingMethod = "subscription" | "free" | "credit" | "payment" | "access_code";
export type CreateFundedJobResult =
  | { ok: true; job: ScrapeJob; fundingMethod: "subscription" | "free" | "credit" }
  | { ok: false; reason: "no_credit" | "user_not_found" };

function toJob(row: typeof scrapeJobs.$inferSelect): ScrapeJob {
  return {
    id: row.id,
    url: row.url,
    status: row.status as ScrapeStatus,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    expiresAt: row.expiresAt?.toISOString(),
    assets: row.assets as Asset[],
    totalAssets: row.totalAssets,
    processedAssets: row.processedAssets,
    successfulAssets: row.successfulAssets,
    failedAssets: row.failedAssets,
    downloadPath: row.downloadPath ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
  };
}

export class DbStorage {
  // Timers are only an optimization. The durable expiry and cleanup lease are
  // authoritative, so losing these handles during restart does not grant access.
  private executionContext = new AsyncLocalStorage<{ jobId: string; token: string }>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private totalDownloads = 0;

  private mutationWhere(id: string) {
    const context = this.executionContext.getStore();
    return context?.jobId === id
      ? and(eq(scrapeJobs.id, id), eq(scrapeJobs.executionToken, context.token))
      : eq(scrapeJobs.id, id);
  }

  runWithJobExecution<T>(jobId: string, token: string, work: () => Promise<T>): Promise<T> {
    return this.executionContext.run({ jobId, token }, work);
  }

  async createJob(url: string, ownerId: number, fundingMethod: FundingMethod = "free"): Promise<ScrapeJob> {
    const id = randomUUID();
    const [row] = await db.insert(scrapeJobs).values({
      id, ownerId, url, status: "scraping", assets: [],
      totalAssets: 0, processedAssets: 0, successfulAssets: 0, failedAssets: 0,
      downloadAuthorized: fundingMethod !== "free",
      authorizationSessionId: fundingMethod !== "free" ? `user_${ownerId}_${id}` : null,
      createdAt: new Date(), fundingMethod, refundApplied: false,
    }).returning();
    return toJob(row);
  }

  async createFundedJob(url: string, ownerId: number, subscribed: boolean): Promise<CreateFundedJobResult> {
    return db.transaction(async (tx) => {
      const result = await tx.execute(sql`select id, free_scrape_used, credits from users where id = ${ownerId} for update`);
      const user = result.rows[0] as { id: number; free_scrape_used: boolean; credits: number } | undefined;
      if (!user) return { ok: false, reason: "user_not_found" };
      let fundingMethod: "subscription" | "free" | "credit";
      if (subscribed) {
        fundingMethod = "subscription";
      } else if (!user.free_scrape_used) {
        fundingMethod = "free";
        await tx.update(users).set({ freeScrapeUsed: true }).where(eq(users.id, ownerId));
      } else if (user.credits > 0) {
        fundingMethod = "credit";
        await tx.update(users).set({ credits: sql`${users.credits} - 1` }).where(eq(users.id, ownerId));
      } else {
        return { ok: false, reason: "no_credit" };
      }
      const id = randomUUID();
      const [row] = await tx.insert(scrapeJobs).values({
        id, ownerId, url, status: "scraping", assets: [],
        downloadAuthorized: fundingMethod !== "free",
        authorizationSessionId: fundingMethod !== "free" ? `user_${ownerId}_${id}` : null,
        fundingMethod, refundApplied: false,
      }).returning();
      return { ok: true, job: toJob(row), fundingMethod };
    });
  }

  async getJob(id: string): Promise<ScrapeJob | undefined> {
    const [row] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id)).limit(1);
    return row ? toJob(row) : undefined;
  }

  async getOwnedJob(id: string, ownerId: number): Promise<ScrapeJob | undefined> {
    const [row] = await db.select().from(scrapeJobs)
      .where(and(eq(scrapeJobs.id, id), eq(scrapeJobs.ownerId, ownerId))).limit(1);
    return row ? toJob(row) : undefined;
  }

  async listExpiredJobIds(limit = 50): Promise<string[]> {
    const rows = await db.select({ id: scrapeJobs.id }).from(scrapeJobs)
      .where(and(lte(scrapeJobs.expiresAt, new Date()),
        or(isNull(scrapeJobs.cleanupLeaseUntil), lt(scrapeJobs.cleanupLeaseUntil, new Date()))))
      .limit(limit);
    return rows.map(row => row.id);
  }

  async isOwner(id: string, ownerId: number): Promise<boolean> {
    const rows = await db.select({ id: scrapeJobs.id }).from(scrapeJobs)
      .where(and(eq(scrapeJobs.id, id), eq(scrapeJobs.ownerId, ownerId))).limit(1);
    return rows.length === 1;
  }

  async updateJobStatus(id: string, status: ScrapeStatus): Promise<void> {
    await db.update(scrapeJobs).set({ status }).where(this.mutationWhere(id));
  }

  async updateJobProgress(id: string, data: Partial<ScrapeJob>): Promise<void> {
    const values: Record<string, unknown> = {};
    for (const key of ["totalAssets", "processedAssets", "successfulAssets", "failedAssets", "errorMessage"] as const) {
      if (data[key] !== undefined) values[key] = data[key];
    }
    if (data.assets !== undefined) values.assets = data.assets;
    if (Object.keys(values).length) {
      await db.update(scrapeJobs).set(values).where(this.mutationWhere(id));
    }
  }

  async addAsset(jobId: string, assetData: Omit<Asset, "id">): Promise<Asset> {
    const asset = { id: randomUUID(), ...assetData };
    await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`select assets from scrape_jobs where id = ${jobId} for update`);
      const row = rows.rows[0] as { assets: Asset[] } | undefined;
      if (!row) throw new Error("Job not found");
      const assets = [...row.assets, asset];
      const updated = await tx.update(scrapeJobs).set({ assets, totalAssets: assets.length })
        .where(this.mutationWhere(jobId)).returning({ id: scrapeJobs.id });
      if (updated.length === 0) throw new Error("JOB_EXECUTION_LEASE_LOST");
    });
    return asset;
  }

  async updateAsset(jobId: string, assetId: string, data: Partial<Asset>): Promise<Asset | undefined> {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`select assets from scrape_jobs where id = ${jobId} for update`);
      const row = rows.rows[0] as { assets: Asset[] } | undefined;
      if (!row) return undefined;
      const index = row.assets.findIndex((asset) => asset.id === assetId);
      if (index < 0) return undefined;
      const asset = { ...row.assets[index], ...data };
      const assets = [...row.assets];
      assets[index] = asset;
      const updated = await tx.update(scrapeJobs).set({
        assets,
        processedAssets: assets.filter(a => ["success", "failed", "skipped"].includes(a.status)).length,
        successfulAssets: assets.filter(a => a.status === "success").length,
        failedAssets: assets.filter(a => a.status === "failed").length,
      }).where(this.mutationWhere(jobId)).returning({ id: scrapeJobs.id });
      if (updated.length === 0) return undefined;
      return asset;
    });
  }

  async completeJob(id: string, executionToken: string, downloadPath?: string): Promise<ScrapeJob | undefined> {
    const [row] = await db.update(scrapeJobs).set({
      status: "completed", completedAt: new Date(), downloadPath,
      executionLeaseUntil: null, executionToken: null,
    }).where(and(eq(scrapeJobs.id, id), eq(scrapeJobs.executionToken, executionToken),
      gt(scrapeJobs.executionLeaseUntil, new Date()), eq(scrapeJobs.status, "scraping"))).returning();
    return row ? toJob(row) : undefined;
  }

  async deleteJob(id: string): Promise<void> {
    await this.cancelExpiry(id);
    await db.delete(scrapeJobs).where(eq(scrapeJobs.id, id));
  }

  async scheduleExpiry(id: string, onExpire: () => void | Promise<void>, ttlMs: number): Promise<void> {
    await this.cancelExpiry(id);
    const expiresAt = new Date(Date.now() + ttlMs);
    await db.update(scrapeJobs).set({ expiresAt }).where(eq(scrapeJobs.id, id));
    const timer = setTimeout(async () => {
      this.expiryTimers.delete(id);
      if (await this.claimExpiredJob(id, 60_000)) await onExpire();
    }, ttlMs);
    timer.unref?.();
    this.expiryTimers.set(id, timer);
  }

  async cancelExpiry(id: string): Promise<boolean> {
    const timer = this.expiryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(id);
    const rows = await db.update(scrapeJobs).set({ expiresAt: null }).where(and(
      eq(scrapeJobs.id, id),
      isNull(scrapeJobs.cleanupLeaseUntil),
    )).returning({ id: scrapeJobs.id });
    return rows.length === 1;
  }

  private async claimExpiredJob(id: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    const rows = await db.update(scrapeJobs).set({
      cleanupLeaseUntil: new Date(now.getTime() + leaseMs),
    }).where(and(
      eq(scrapeJobs.id, id),
      lte(scrapeJobs.expiresAt, now),
      or(isNull(scrapeJobs.cleanupLeaseUntil), lt(scrapeJobs.cleanupLeaseUntil, now)),
    )).returning({ id: scrapeJobs.id });
    return rows.length === 1;
  }

  async claimExpiredJobIds(): Promise<string[]> {
    const now = new Date();
    const rows = await db.update(scrapeJobs).set({
      cleanupLeaseUntil: new Date(now.getTime() + 60_000),
    }).where(and(
      lte(scrapeJobs.expiresAt, now),
      or(isNull(scrapeJobs.cleanupLeaseUntil), lt(scrapeJobs.cleanupLeaseUntil, now)),
    )).returning({ id: scrapeJobs.id });
    return rows.map(row => row.id);
  }

  async claimCleanup(id: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    const rows = await db.update(scrapeJobs).set({ cleanupLeaseUntil: new Date(now.getTime() + leaseMs) })
      .where(and(eq(scrapeJobs.id, id), or(isNull(scrapeJobs.cleanupLeaseUntil), lt(scrapeJobs.cleanupLeaseUntil, now))))
      .returning({ id: scrapeJobs.id });
    return rows.length === 1;
  }

  async claimExecution(id: string, token: string, leaseMs = 45_000): Promise<boolean> {
    const now = new Date();
    const rows = await db.update(scrapeJobs).set({
      executionToken: token, executionLeaseUntil: new Date(now.getTime() + leaseMs),
    }).where(and(eq(scrapeJobs.id, id), eq(scrapeJobs.status, "scraping"),
      or(isNull(scrapeJobs.executionLeaseUntil), lt(scrapeJobs.executionLeaseUntil, now))))
      .returning({ id: scrapeJobs.id });
    return rows.length === 1;
  }

  async renewExecution(id: string, token: string, leaseMs = 45_000): Promise<boolean> {
    const rows = await db.update(scrapeJobs).set({ executionLeaseUntil: new Date(Date.now() + leaseMs) })
      .where(and(eq(scrapeJobs.id, id), eq(scrapeJobs.executionToken, token),
        eq(scrapeJobs.status, "scraping"), gt(scrapeJobs.executionLeaseUntil, new Date())))
      .returning({ id: scrapeJobs.id });
    return rows.length === 1;
  }

  async failJob(jobId: string, token: string, errorMessage: string, ttlMs: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const rows = await tx.update(scrapeJobs).set({
        status: "failed",
        errorMessage,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMs),
        executionLeaseUntil: null,
        executionToken: null,
        refundApplied: true,
      }).where(and(
        eq(scrapeJobs.id, jobId),
        eq(scrapeJobs.status, "scraping"),
        eq(scrapeJobs.executionToken, token),
        eq(scrapeJobs.refundApplied, false),
      )).returning({
        ownerId: scrapeJobs.ownerId,
        fundingMethod: scrapeJobs.fundingMethod,
      });
      if (rows.length === 0) return false;

      const row = rows[0];
      if (row.fundingMethod === "free") {
        await tx.update(users).set({ freeScrapeUsed: false }).where(eq(users.id, row.ownerId));
      } else if (row.fundingMethod === "credit") {
        await tx.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, row.ownerId));
      }
      await tx.delete(downloadEvents).where(eq(downloadEvents.jobId, jobId));
      return true;
    });
  }

  async authorizeDownload(jobId: string, sessionId: string): Promise<boolean> {
    const rows = await db.update(scrapeJobs).set({
      downloadAuthorized: true, authorizationSessionId: sessionId, chargingUntil: null, chargingToken: null,
    }).where(and(eq(scrapeJobs.id, jobId), eq(scrapeJobs.downloadAuthorized, false)))
      .returning({ id: scrapeJobs.id });
    if (rows.length) return true;
    return this.isDownloadAuthorized(jobId);
  }

  async isDownloadAuthorized(jobId: string): Promise<boolean> {
    const rows = await db.select({ id: scrapeJobs.id }).from(scrapeJobs)
      .where(and(eq(scrapeJobs.id, jobId), eq(scrapeJobs.downloadAuthorized, true))).limit(1);
    return rows.length === 1;
  }

  async isSessionConsumed(sessionId: string): Promise<boolean> {
    const rows = await db.select({ id: scrapeJobs.id }).from(scrapeJobs)
      .where(eq(scrapeJobs.authorizationSessionId, sessionId)).limit(1);
    return rows.length === 1;
  }

  async claimCharging(jobId: string, leaseMs = 15 * 60_000): Promise<string | null> {
    const now = new Date();
    const token = randomUUID();
    const rows = await db.update(scrapeJobs).set({ chargingUntil: new Date(now.getTime() + leaseMs), chargingToken: token })
      .where(and(eq(scrapeJobs.id, jobId), eq(scrapeJobs.downloadAuthorized, false),
        or(isNull(scrapeJobs.chargingUntil), lt(scrapeJobs.chargingUntil, now))))
      .returning({ id: scrapeJobs.id });
    return rows.length === 1 ? token : null;
  }

  async releaseCharging(jobId: string, token: string): Promise<void> {
    await db.update(scrapeJobs).set({ chargingUntil: null, chargingToken: null })
      .where(and(eq(scrapeJobs.id, jobId), eq(scrapeJobs.chargingToken, token)));
  }

  async chargeCreditAndAuthorize(jobId: string, ownerId: number, sessionId: string, chargingToken: string): Promise<"authorized" | "no_credit" | "not_claimed"> {
    return db.transaction(async (tx) => {
      const locked = await tx.execute(sql`
        select owner_id, download_authorized, charging_until, charging_token
        from scrape_jobs where id = ${jobId} for update
      `);
      const job = locked.rows[0] as {
        owner_id: number;
        download_authorized: boolean;
        charging_until: Date | string | null;
        charging_token: string | null;
      } | undefined;
      if (!job || job.owner_id !== ownerId || job.charging_token !== chargingToken ||
          !job.charging_until || new Date(job.charging_until).getTime() <= Date.now()) return "not_claimed";
      if (job.download_authorized) return "authorized";
      const charged = await tx.update(users).set({ credits: sql`${users.credits} - 1` })
        .where(and(eq(users.id, ownerId), gt(users.credits, 0))).returning({ id: users.id });
      if (!charged.length) return "no_credit";
      await tx.update(scrapeJobs).set({
        downloadAuthorized: true, authorizationSessionId: sessionId, chargingUntil: null, chargingToken: null,
      }).where(eq(scrapeJobs.id, jobId));
      return "authorized";
    });
  }

  async claimAbandonedJobs(limit = 10): Promise<Array<{ job: ScrapeJob; token: string }>> {
    const now = new Date();
    const candidates = await db.select().from(scrapeJobs).where(and(
      eq(scrapeJobs.status, "scraping"),
      or(
        lt(scrapeJobs.executionLeaseUntil, now),
        and(isNull(scrapeJobs.executionLeaseUntil), lt(scrapeJobs.createdAt, new Date(now.getTime() - 120_000))),
      ),
    )).limit(limit);
    const claimed: Array<{ job: ScrapeJob; token: string }> = [];
    for (const candidate of candidates) {
      const token = randomUUID();
      const rows = await db.update(scrapeJobs).set({
        executionToken: token,
        executionLeaseUntil: new Date(now.getTime() + 45_000),
        assets: [],
        totalAssets: 0,
        processedAssets: 0,
        successfulAssets: 0,
        failedAssets: 0,
        errorMessage: null,
      }).where(and(
        eq(scrapeJobs.id, candidate.id),
        eq(scrapeJobs.status, "scraping"),
        or(
          lt(scrapeJobs.executionLeaseUntil, now),
          and(isNull(scrapeJobs.executionLeaseUntil), lt(scrapeJobs.createdAt, new Date(now.getTime() - 120_000))),
        ),
      )).returning();
      if (rows.length === 1) claimed.push({ job: toJob(rows[0]), token });
    }
    return claimed;
  }

  recordDownload(): void { this.totalDownloads++; }
  getAnalytics(): AnalyticsData {
    return { totalJobsCreated: 0, totalAssetsScraped: 0, totalDownloads: this.totalDownloads, uniqueUrlsScraped: [], recentJobs: [] };
  }

  async createAccessCode(note: string, maxUses: number | null): Promise<AccessCode> {
    const [row] = await db.insert(accessCodesTable).values({ code: generateAccessCode(), note: note || "", maxUses, uses: 0 }).returning();
    return { ...row, maxUses: row.maxUses ?? null, createdAt: row.createdAt.toISOString() };
  }
  async listAccessCodes(): Promise<AccessCode[]> {
    const rows = await db.select().from(accessCodesTable).orderBy(accessCodesTable.createdAt);
    return rows.reverse().map(row => ({ ...row, maxUses: row.maxUses ?? null, createdAt: row.createdAt.toISOString() }));
  }
  async deleteAccessCode(code: string): Promise<boolean> {
    const result = await db.delete(accessCodesTable).where(eq(accessCodesTable.code, code));
    return (result.rowCount ?? 0) > 0;
  }
  async redeemAccessCode(code: string): Promise<boolean> {
    const rows = await db.update(accessCodesTable).set({ uses: sql`${accessCodesTable.uses} + 1` })
      .where(and(eq(accessCodesTable.code, code.toUpperCase().trim()),
        or(isNull(accessCodesTable.maxUses), lt(accessCodesTable.uses, accessCodesTable.maxUses))))
      .returning({ code: accessCodesTable.code });
    return rows.length > 0;
  }
}

export const storage = new DbStorage();