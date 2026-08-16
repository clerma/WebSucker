import { z } from "zod";
import { pgTable, serial, text, integer, timestamp, boolean, varchar, json, index, uniqueIndex } from "drizzle-orm/pg-core";
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

// Password reset tokens — single-use, short-lived. Only the SHA-256 hash of
// the token is stored; the raw token exists only in the emailed link.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Missing reset token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

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
  websiteUrl: text("website_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Persistent record of every download unlock: which user unlocked which
// website and how it was paid for. This is what ties revenue to sites for
// credit-pack and subscription users (their charge isn't job-bound).
export const downloadEvents = pgTable("download_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userEmail: text("user_email"),
  jobId: text("job_id"),
  websiteUrl: text("website_url").notNull(),
  method: text("method").notNull(), // 'credit' | 'subscription' | 'payment' | 'access_code'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Concurrent writers (webhook vs. browser verify) dedupe per job+method;
  // NULL job_ids are distinct so unbound events are unaffected.
  uniqueIndex("download_events_job_method_idx").on(table.jobId, table.method),
]);

// Express session store (managed by connect-pg-simple at runtime).
// Declared here so drizzle db:push doesn't try to drop it.
export const userSessions = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);

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
  errorMessage: z.string().optional(),
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
