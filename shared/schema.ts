import { z } from "zod";
import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// User accounts — scraping is gated behind these.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  credits: integer("credits").notNull().default(0),
  freeScrapeUsed: boolean("free_scrape_used").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const registerSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Persistent access codes table — survives server restarts
export const accessCodes = pgTable("access_codes", {
  code: text("code").primaryKey(),
  note: text("note").notNull().default(""),
  maxUses: integer("max_uses"),
  uses: integer("uses").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Persistent payments table — survives key changes and restarts
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  customerEmail: text("customer_email"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  mode: text("mode").notNull(), // 'payment' | 'subscription'
  jobId: text("job_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Persistent analytics table — survives server restarts
export const scrapeAnalytics = pgTable("scrape_analytics", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  status: text("status").notNull(), // 'completed' | 'failed'
  totalAssets: integer("total_assets").notNull().default(0),
  successfulAssets: integer("successful_assets").notNull().default(0),
  failedAssets: integer("failed_assets").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
});

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
  expiresAt: z.string().optional(),
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
