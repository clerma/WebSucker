import { randomUUID } from "crypto";
import type { Asset, ScrapeJob, ScrapeStatus, AssetStatus, AssetType } from "@shared/schema";

export interface IStorage {
  createJob(url: string): Promise<ScrapeJob>;
  getJob(id: string): Promise<ScrapeJob | undefined>;
  updateJobStatus(id: string, status: ScrapeStatus): Promise<void>;
  updateJobProgress(id: string, data: Partial<ScrapeJob>): Promise<void>;
  addAsset(jobId: string, asset: Omit<Asset, "id">): Promise<Asset>;
  updateAsset(jobId: string, assetId: string, data: Partial<Asset>): Promise<Asset | undefined>;
  completeJob(id: string, downloadPath?: string): Promise<ScrapeJob | undefined>;
  deleteJob(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, ScrapeJob>;

  constructor() {
    this.jobs = new Map();
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

    // Recalculate stats
    job.processedAssets = job.assets.filter(
      (a) => a.status === "success" || a.status === "failed" || a.status === "skipped"
    ).length;
    job.successfulAssets = job.assets.filter((a) => a.status === "success").length;
    job.failedAssets = job.assets.filter((a) => a.status === "failed").length;

    this.jobs.set(jobId, job);
    return asset;
  }

  async completeJob(id: string, downloadPath?: string): Promise<ScrapeJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    job.status = "completed";
    job.completedAt = new Date().toISOString();
    if (downloadPath) job.downloadPath = downloadPath;

    this.jobs.set(id, job);
    return job;
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
  }
}

export const storage = new MemStorage();
