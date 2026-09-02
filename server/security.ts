import { promises as dns } from "dns";
import net from "net";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import { rateLimitBuckets, securityAuditEvents } from "@shared/schema";
import { sql } from "drizzle-orm";

/**
 * SSRF protection.
 *
 * A lexical hostname blocklist is not enough: an attacker can point a public
 * DNS name at a private IP, use a redirect, or encode the IP in a way the
 * hostname regex misses (decimal / hex / octal). The only robust check is to
 * resolve the host to its actual IP addresses and reject any that fall in a
 * private, loopback, link-local, or otherwise-reserved range.
 */

// --- IP classification -----------------------------------------------------

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let long = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    long = long * 256 + n;
  }
  return long >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return true; // unparseable → treat as unsafe
  const inRange = (cidrBase: string, bits: number) => {
    const base = ipv4ToLong(cidrBase);
    if (base === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (long & mask) === (base & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||       // "this" network
    inRange("10.0.0.0", 8) ||      // private
    inRange("100.64.0.0", 10) ||   // CGNAT
    inRange("127.0.0.0", 8) ||     // loopback
    inRange("169.254.0.0", 16) ||  // link-local (cloud metadata 169.254.169.254)
    inRange("172.16.0.0", 12) ||   // private
    inRange("192.0.0.0", 24) ||    // IETF protocol assignments
    inRange("192.168.0.0", 16) ||  // private
    inRange("198.18.0.0", 15) ||   // benchmarking
    inRange("224.0.0.0", 4) ||     // multicast
    inRange("240.0.0.0", 4)        // reserved
  );
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4-mapped / -compatible: ::ffff:127.0.0.1 etc. — check the embedded v4.
  const mapped = addr.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  if (addr === "::1" || addr === "::") return true;              // loopback / unspecified
  if (addr.startsWith("fe80") || addr.startsWith("fe9") ||
      addr.startsWith("fea") || addr.startsWith("feb")) return true; // link-local
  if (/^f[cd]/.test(addr)) return true;                          // unique-local fc00::/7
  if (addr.startsWith("ff")) return true;                        // multicast
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal → unsafe
}

// Normalise non-dotted-quad IPv4 encodings (decimal, hex, octal) that
// `new URL()` leaves untouched in the hostname, e.g. http://2130706433/.
function normalizeNumericHost(host: string): string {
  const h = host.trim();
  // Pure decimal integer, e.g. 2130706433 → 127.0.0.1
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    }
  }
  // Hex, e.g. 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(h)) {
    const n = parseInt(h, 16);
    if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    }
  }
  return host;
}

const hostDecisionCache = new Map<string, boolean>();

/**
 * Resolves `hostname` and returns true if it is safe to fetch (public address).
 * Results are cached per host for the process lifetime to avoid repeated
 * lookups during a crawl; the TTL is intentionally coarse because a scrape job
 * is short-lived.
 */
export async function isHostPublic(hostname: string): Promise<boolean> {
  const host = normalizeNumericHost(hostname.toLowerCase().replace(/\.$/, ""));

  const cached = hostDecisionCache.get(host);
  if (cached !== undefined) return cached;

  let safe: boolean;
  try {
    if (net.isIP(host)) {
      safe = !isBlockedIp(host);
    } else {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      safe = records.length > 0 && records.every((r) => !isBlockedIp(r.address));
    }
  } catch {
    safe = false; // resolution failure → fail closed
  }

  hostDecisionCache.set(host, safe);
  return safe;
}

export class SsrfError extends Error {
  constructor(message = "This address is not allowed.") {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Throws SsrfError if the URL is not a public http(s) resource. Use this before
 * any server-side fetch of a user-influenced URL, and re-check after every
 * redirect hop.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError("Only HTTP and HTTPS URLs are supported.");
  }
  if (!(await isHostPublic(parsed.hostname))) {
    throw new SsrfError("Cannot fetch internal or private network addresses.");
  }
  return parsed;
}

// --- Request-origin validation ---------------------------------------------

export function configuredOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>();
  if (env.APP_BASE_URL) {
    try { origins.add(new URL(env.APP_BASE_URL).origin); } catch { /* invalid config fails closed */ }
  }
  for (const domain of (env.REPLIT_DOMAINS || "").split(",").map(v => v.trim()).filter(Boolean)) {
    try { origins.add(new URL(`https://${domain}`).origin); } catch { /* ignore malformed configured domain */ }
  }
  if (env.REPLIT_DEV_DOMAIN) {
    try { origins.add(new URL(`https://${env.REPLIT_DEV_DOMAIN}`).origin); } catch { /* invalid config fails closed */ }
  }
  return origins;
}

export function isTrustedRequestOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return false;
  try {
    return configuredOrigins(env).has(new URL(origin).origin);
  } catch {
    return false;
  }
}

/** CSRF protection for every state-changing application API. The Stripe
 * webhook is registered before this middleware and remains signature-gated. */
export function sameOriginProtection(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/") || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  return requireTrustedOrigin(req, res, next);
}

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = typeof req.headers.origin === "string"
    ? req.headers.origin
    : typeof req.headers.referer === "string" ? req.headers.referer : undefined;
  if (!isTrustedRequestOrigin(origin)) {
    return res.status(403).json({ message: "Request origin is not allowed" });
  }
  next();
}

// --- Distributed rate limiting --------------------------------------------

function hashIdentity(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requestIdentities(req: Request, subject?: (req: Request) => string | null): string[] {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const identities = [`ip:${hashIdentity(ip)}`];
  if (req.session?.userId) identities.push(`user:${req.session.userId}`);
  const target = subject?.(req);
  if (target) identities.push(`subject:${hashIdentity(target)}`);
  return [...new Set(identities)];
}

let rateLimitCleanupTimer: NodeJS.Timeout | undefined;

async function deleteExpiredRateLimitBuckets() {
  await db.execute(sql`
    DELETE FROM "rate_limit_buckets"
    WHERE "reset_at" < NOW()
  `);
}

export async function ensureSecurityInfrastructure() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
      "key" text PRIMARY KEY,
      "count" integer NOT NULL DEFAULT 0,
      "reset_at" timestamp NOT NULL,
      "audit_emitted" boolean NOT NULL DEFAULT false
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "rate_limit_buckets_reset_at_idx"
    ON "rate_limit_buckets" ("reset_at")
  `);
  await deleteExpiredRateLimitBuckets();
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(() => {
      deleteExpiredRateLimitBuckets().catch((err) =>
        console.error("Failed to clean expired rate-limit buckets:", err),
      );
    }, 5 * 60_000);
    rateLimitCleanupTimer.unref?.();
  }
}

async function recordRateLimitAudit(req: Request, keyPrefix: string) {
  await db.insert(securityAuditEvents).values({
    userId: req.session?.userId ?? null,
    action: "rate_limit",
    outcome: "denied",
    reason: keyPrefix.slice(0, 120),
    ipAddress: (req.ip || req.socket.remoteAddress || "").slice(0, 64) || null,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300) || null,
  });
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  message?: string;
  subject?: (req: Request) => string | null;
}) {
  const { windowMs, max, keyPrefix = "", message = "Too many requests. Please slow down and try again shortly.", subject } = opts;
  return async (req: Request, res: Response, next: NextFunction) => {
    const resetAt = new Date(Date.now() + windowMs);
    try {
      for (const identity of requestIdentities(req, subject)) {
        const key = `${keyPrefix}:${identity}`;
        const result = await db.execute(sql`
          INSERT INTO ${rateLimitBuckets} ("key", "count", "reset_at", "audit_emitted")
          VALUES (${key}, 1, ${resetAt}, false)
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
              WHEN ${rateLimitBuckets.resetAt} <= NOW() THEN 1
              ELSE ${rateLimitBuckets.count} + 1
            END,
            "reset_at" = CASE
              WHEN ${rateLimitBuckets.resetAt} <= NOW() THEN ${resetAt}
              ELSE ${rateLimitBuckets.resetAt}
            END,
            "audit_emitted" = CASE
              WHEN ${rateLimitBuckets.resetAt} <= NOW() THEN false
              ELSE ${rateLimitBuckets.auditEmitted}
            END
          RETURNING "count", "reset_at"
        `);
        const bucket = result.rows[0] as { count: number; reset_at: Date | string };
        if (Number(bucket.count) > max) {
          const claimed = await db.execute(sql`
            UPDATE ${rateLimitBuckets}
            SET "audit_emitted" = true
            WHERE "key" = ${key} AND "audit_emitted" = false
            RETURNING "key"
          `);
          if (claimed.rowCount) {
            recordRateLimitAudit(req, keyPrefix).catch((err) =>
              console.error("Failed to record rate-limit audit event:", err),
            );
          }
          const retryAfter = Math.max(
            1,
            Math.ceil((new Date(bucket.reset_at).getTime() - Date.now()) / 1000),
          );
          res.setHeader("Retry-After", String(retryAfter));
          return res.status(429).json({ message });
        }
      }
      next();
    } catch (err) {
      console.error("Rate limiter unavailable:", err);
      // Never silently turn a database outage into an abuse-control bypass.
      res.setHeader("Retry-After", "5");
      return res.status(503).json({ message: "Security checks are temporarily unavailable. Please try again." });
    }
  };
}
