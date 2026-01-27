import { z } from "zod";

export const AssetType = z.enum(["html", "css", "js", "image", "font", "other"]);
export type AssetType = z.infer<typeof AssetType>;

export const AssetStatus = z.enum(["pending", "downloading", "success", "failed", "skipped"]);
export type AssetStatus = z.infer<typeof AssetStatus>;

export const assetSchema = z.object({
  id: z.string(),
  type: AssetType,
  originalUrl: z.string(),
  localPath: z.string(),
  status: AssetStatus,
  size: z.number().optional(),
  error: z.string().optional(),
  referencedFrom: z.string().optional(),
});
export type Asset = z.infer<typeof assetSchema>;

export const ScrapeStatus = z.enum(["idle", "scraping", "completed", "failed"]);
export type ScrapeStatus = z.infer<typeof ScrapeStatus>;

export const scrapeJobSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  status: ScrapeStatus,
  createdAt: z.string(),
  completedAt: z.string().optional(),
  assets: z.array(assetSchema),
  totalAssets: z.number(),
  processedAssets: z.number(),
  successfulAssets: z.number(),
  failedAssets: z.number(),
  downloadPath: z.string().optional(),
});
export type ScrapeJob = z.infer<typeof scrapeJobSchema>;

export const startScrapeSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});
export type StartScrapeInput = z.infer<typeof startScrapeSchema>;

export const scrapeProgressSchema = z.object({
  jobId: z.string(),
  status: ScrapeStatus,
  currentAsset: assetSchema.optional(),
  totalAssets: z.number(),
  processedAssets: z.number(),
  successfulAssets: z.number(),
  failedAssets: z.number(),
  message: z.string().optional(),
});
export type ScrapeProgress = z.infer<typeof scrapeProgressSchema>;
