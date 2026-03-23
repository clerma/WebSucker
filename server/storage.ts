import { randomUUID } from "crypto";
import type { Asset, ScrapeJob, ScrapeStatus, AssetStatus, AssetType } from "@shared/schema";

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
    id: string;
    url: string;
    status: ScrapeStatus;
    totalAssets: number;
    successfulAssets: number;
    createdAt: string;
    completedAt?: string;
  }>;
}

export interface IStorage {
  createJob(url: string): Promise<ScrapeJob>;
  getJob(id: string): Promise<ScrapeJob | undefined>;
  updateJobStatus(id: string, status: ScrapeStatus): Promise<void>;
  updateJobProgress(id: string, data: Partial<ScrapeJob>): Promise<void>;
  addAsset(jobId: string, asset: Omit<Asset, "id">): Promise<Asset>;
  updateAsset(jobId: string, assetId: string, data: Partial<Asset>): Promise<Asset | undefined>;
  completeJob(id: string, downloadPath?: string): Promise<ScrapeJob | undefined>;
  deleteJob(id: string): Promise<void>;
  scheduleExpiry(id: string, onExpire: () => void, ttlMs: number): void;
  cancelExpiry(id: string): void;
  authorizeDownload(jobId: string, sessionId: string): void;
  isDownloadAuthorized(jobId: string): boolean;
  isSessionConsumed(sessionId: string): boolean;
  recordDownload(): void;
  getAnalytics(): AnalyticsData;
  createAccessCode(note: string, maxUses: number | null): AccessCode;
  listAccessCodes(): AccessCode[];
  deleteAccessCode(code: string): boolean;
  redeemAccessCode(code: string): boolean;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, ScrapeJob>;
  private authorizedJobs: Set<string>;
  private consumedSessions: Set<string>;
  private expiryTimers: Map<string, ReturnType<typeof setTimeout>>;
  private totalJobsCreated: number;
  private totalAssetsScraped: number;
  private totalDownloads: number;
  private uniqueUrlsScraped: Set<string>;
  private recentJobs: AnalyticsData["recentJobs"];
  private accessCodes: Map<string, AccessCode>;

  constructor() {
    this.jobs = new Map();
    this.authorizedJobs = new Set();
    this.consumedSessions = new Set();
    this.expiryTimers = new Map();
    this.totalJobsCreated = 0;
    this.totalAssetsScraped = 0;
    this.totalDownloads = 0;
    this.uniqueUrlsScraped = new Set();
    this.recentJobs = [];
    this.accessCodes = new Map();
  }

  async createJob(url: string): Promise<ScrapeJob> {
    const id = randomUUID();
    const job: ScrapeJob = {
      id,
      url,
      status: "scraping",
      createdAt: new Date().toISOString(),
      assets: [],
      totalAssets: 0,
      processedAssets: 0,
      successfulAssets: 0,
      failedAssets: 0,
    };
    this.jobs.set(id, job);
    this.totalJobsCreated++;
    try {
      const hostname = new URL(url).hostname;
      this.uniqueUrlsScraped.add(hostname);
    } catch {}
    return job;
  }

  async getJob(id: string): Promise<ScrapeJob | undefined> {
    return this.jobs.get(id);
  }

  async updateJobStatus(id: string, status: ScrapeStatus): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      this.jobs.set(id, job);
    }
  }

  async updateJobProgress(id: string, data: Partial<ScrapeJob>): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, data);
      this.jobs.set(id, job);
    }
  }

  async addAsset(jobId: string, assetData: Omit<Asset, "id">): Promise<Asset> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Job not found");

    const asset: Asset = {
      id: randomUUID(),
      ...assetData,
    };
    job.assets.push(asset);
    job.totalAssets = job.assets.length;
    this.jobs.set(jobId, job);
    this.totalAssetsScraped++;
    return asset;
  }

  async updateAsset(
    jobId: string,
    assetId: string,
    data: Partial<Asset>
  ): Promise<Asset | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const assetIndex = job.assets.findIndex((a) => a.id === assetId);
    if (assetIndex === -1) return undefined;

    const asset = { ...job.assets[assetIndex], ...data };
    job.assets[assetIndex] = asset;

    job.processedAssets = job.assets.filter(
      (a) => a.status === "success" || a.status === "failed" || a.status === "skipped"
    ).length;
    job.successfulAssets = job.assets.filter((a) => a.status === "success").length;
    job.failedAssets = job.assets.filter((a) => a.status === "failed").length;

    this.jobs.set(jobId, job);
    return asset;
  }

  scheduleExpiry(id: string, onExpire: () => void, ttlMs: number): void {
    this.cancelExpiry(id);
    const timer = setTimeout(() => {
      this.expiryTimers.delete(id);
      onExpire();
    }, ttlMs);
    this.expiryTimers.set(id, timer);
    // Update job expiresAt
    const job = this.jobs.get(id);
    if (job) {
      job.expiresAt = new Date(Date.now() + ttlMs).toISOString();
      this.jobs.set(id, job);
    }
  }

  cancelExpiry(id: string): void {
    const timer = this.expiryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(id);
    }
  }

  async completeJob(id: string, downloadPath?: string): Promise<ScrapeJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    job.status = "completed";
    job.completedAt = new Date().toISOString();
    if (downloadPath) job.downloadPath = downloadPath;

    this.jobs.set(id, job);

    this.recentJobs.unshift({
      id: job.id,
      url: job.url,
      status: job.status,
      totalAssets: job.totalAssets,
      successfulAssets: job.successfulAssets,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
    if (this.recentJobs.length > 50) {
      this.recentJobs = this.recentJobs.slice(0, 50);
    }

    return job;
  }

  async deleteJob(id: string): Promise<void> {
    this.cancelExpiry(id);
    this.jobs.delete(id);
    this.authorizedJobs.delete(id);
  }

  authorizeDownload(jobId: string, sessionId: string): void {
    this.authorizedJobs.add(jobId);
    this.consumedSessions.add(sessionId);
  }

  isDownloadAuthorized(jobId: string): boolean {
    return this.authorizedJobs.has(jobId);
  }

  isSessionConsumed(sessionId: string): boolean {
    return this.consumedSessions.has(sessionId);
  }

  recordDownload(): void {
    this.totalDownloads++;
  }

  getAnalytics(): AnalyticsData {
    return {
      totalJobsCreated: this.totalJobsCreated,
      totalAssetsScraped: this.totalAssetsScraped,
      totalDownloads: this.totalDownloads,
      uniqueUrlsScraped: Array.from(this.uniqueUrlsScraped),
      recentJobs: this.recentJobs,
    };
  }

  createAccessCode(note: string, maxUses: number | null): AccessCode {
    const words = ["SUNSET", "RIVER", "FALCON", "EMBER", "WAVE", "CEDAR", "DUSK", "PINE", "FROST", "BLOOM"];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `${word}-${num}`;
    const entry: AccessCode = {
      code,
      note: note || "",
      maxUses,
      uses: 0,
      createdAt: new Date().toISOString(),
    };
    this.accessCodes.set(code, entry);
    return entry;
  }

  listAccessCodes(): AccessCode[] {
    return Array.from(this.accessCodes.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  deleteAccessCode(code: string): boolean {
    return this.accessCodes.delete(code);
  }

  redeemAccessCode(code: string): boolean {
    const entry = this.accessCodes.get(code.toUpperCase().trim());
    if (!entry) return false;
    if (entry.maxUses !== null && entry.uses >= entry.maxUses) return false;
    entry.uses++;
    this.accessCodes.set(entry.code, entry);
    return true;
  }
}

export const storage = new MemStorage();
