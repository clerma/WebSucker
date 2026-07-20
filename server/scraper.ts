import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import archiver from "archiver";
import puppeteerVanilla from "puppeteer";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "puppeteer";

// Apply stealth plugin to bypass common bot-detection fingerprints
// (Cloudflare's "Just a moment..." challenge, Distil, PerimeterX, etc.)
puppeteerExtra.use(StealthPlugin());
const puppeteer: typeof puppeteerVanilla = puppeteerExtra as any;
import { storage } from "./storage";
import type { Asset, AssetType, AssetStatus, ScrapeProgress } from "@shared/schema";

type ProgressCallback = (progress: ScrapeProgress, asset?: Asset) => void;

interface ScrapeOptions {
  jobId: string;
  url: string;
  onProgress: ProgressCallback;
}

// Safety limits to prevent runaway crawling
const MAX_ASSETS = 750;
const MAX_HTML_PAGES = 50;
const MAX_ASSET_SIZE = 20 * 1024 * 1024; // 20MB per asset
const REQUEST_DELAY = 150; // ms between requests

const ALLOWED_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".json",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".xml", ".txt", ".pdf",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".rar", ".gz", ".tar",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".avi", ".mov",
  ".csv", ".rtf", ".epub",
]);

const SKIP_DOMAINS = new Set([
  "google-analytics.com", "googletagmanager.com", "facebook.net",
  "twitter.com", "linkedin.com", "doubleclick.net", "googlesyndication.com",
  "facebook.com", "hotjar.com", "clarity.ms", "segment.com",
]);

const EMBED_DOMAINS = new Set([
  "youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com",
  "youtu.be",
  "player.vimeo.com", "vimeo.com",
  "maps.google.com", "www.google.com",
  "open.spotify.com", "embed.spotify.com",
  "w.soundcloud.com", "soundcloud.com",
  "bandcamp.com",
  "codepen.io",
  "jsfiddle.net",
  "calendly.com",
  "docs.google.com",
  "drive.google.com",
  "forms.gle",
  "airtable.com",
  "typeform.com",
  "tally.so",
  "wistia.com", "fast.wistia.com",
  "player.twitch.tv",
  "clips.twitch.tv",
  "anchor.fm",
  "podcasters.spotify.com",
  "embed.podcasts.apple.com",
  "share.transistor.fm",
  "www.tiktok.com",
  "platform.twitter.com", "x.com",
  "www.instagram.com",
  "www.facebook.com",
  "giphy.com", "media.giphy.com",
]);

// Block private/internal IP ranges for SSRF protection
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_IP_PATTERNS.some(pattern => pattern.test(hostname));
}

// Wix helpers ---------------------------------------------------------------

// Extract the media hash from a Wix CDN URL.
// e.g. https://static.wixstatic.com/media/abc123_9.jpg/v1/fill/w_480,...
// returns "abc123_9.jpg"
function extractWixMediaHash(url: string): string | null {
  const match = url.match(/static\.wixstatic\.com\/media\/([^/]+)/);
  return match ? match[1] : null;
}

// Convert a wix:image://v1/{hash}/{filename}#{dims} internal URI to a real CDN URL.
// Returns null if the input is not a wix:image URI.
function resolveWixUri(wixUri: string): string | null {
  const match = wixUri.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (match) {
    return `https://static.wixstatic.com/media/${match[1]}`;
  }
  return null;
}

// ---------------------------------------------------------------------------

function parseSrcset(srcset: string): Array<{ url: string; descriptor: string }> {
  const entries: Array<{ url: string; descriptor: string }> = [];
  // Split on commas that are followed by whitespace and a URL-like start
  // This preserves commas inside URLs (e.g., Wix image paths: /fill/w_100,h_200,...)
  const parts = srcset.split(/,\s+(?=https?:\/\/|\/\/|\/(?!\/)|\w+[:.\/])/);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Match URL and optional descriptor (1x, 2x, 100w, etc.)
    const match = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?[wx])$/);
    if (match) {
      entries.push({ url: match[1].trim(), descriptor: match[2] });
    } else {
      entries.push({ url: trimmed, descriptor: "" });
    }
  }
  
  return entries;
}

function convertToEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // YouTube
    if (parsed.hostname.includes("youtube.com") || parsed.hostname === "youtu.be") {
      let videoId = "";
      if (parsed.hostname === "youtu.be") {
        videoId = parsed.pathname.slice(1);
      } else {
        videoId = parsed.searchParams.get("v") || "";
        if (!videoId && parsed.pathname.startsWith("/embed/")) {
          return url;
        }
      }
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    // Vimeo
    if (parsed.hostname.includes("vimeo.com")) {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match) return `https://player.vimeo.com/video/${match[1]}`;
      if (parsed.hostname === "player.vimeo.com") return url;
    }
  } catch {}
  return null;
}

function isEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return EMBED_DOMAINS.has(parsed.hostname) ||
      Array.from(EMBED_DOMAINS).some(d => parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function getAssetType(url: string): AssetType {
  const pathname = new URL(url, "http://example.com").pathname.toLowerCase();
  const ext = path.extname(pathname);

  if ([".html", ".htm", ""].includes(ext)) return "html";
  if (ext === ".css") return "css";
  if ([".js", ".mjs"].includes(ext)) return "js";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif"].includes(ext)) return "image";
  if ([".woff", ".woff2", ".ttf", ".eot", ".otf"].includes(ext)) return "font";
  return "other";
}

function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    
    // Remove hash
    url.hash = "";
    
    // Skip data URIs, javascript, mailto, tel
    if (url.protocol === "data:" || url.protocol === "javascript:" || 
        url.protocol === "mailto:" || url.protocol === "tel:") {
      return null;
    }
    
    // Skip fragment-only references (e.g., #section)
    if (href.startsWith("#")) {
      return null;
    }
    
    // Squarespace image CDN: all query params are resize/format parameters
    // (format=1500w, w=1500, h=750, etc.). Strip them so every size variant
    // of the same image deduplicates to a single download.
    if (url.hostname === "images.squarespace-cdn.com" && url.search) {
      url.search = "";
    }
    
    return url.href;
  } catch {
    return null;
  }
}

function isExternalUrl(url: string, baseHost: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname !== baseHost;
  } catch {
    return true;
  }
}

function shouldSkipUrl(url: string): { skip: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    
    // Skip known analytics/tracking domains
    if (SKIP_DOMAINS.has(parsed.hostname) || 
        Array.from(SKIP_DOMAINS).some(d => parsed.hostname.endsWith(`.${d}`))) {
      return { skip: true, reason: "Third-party tracking/analytics script" };
    }
    
    // Skip RSS/feed URLs - these return XML instead of HTML
    // Check path-based feeds
    const feedPaths = ["/feed", "/rss", "/atom", "/rss.xml", "/atom.xml", "/feed.xml"];
    const pathLower = parsed.pathname.toLowerCase();
    if (feedPaths.some(fp => pathLower === fp || pathLower.endsWith(fp))) {
      return { skip: true, reason: "RSS/XML feed URL" };
    }
    
    // Check query parameter patterns for feeds
    const feedParams = ["format", "output", "feed", "type"];
    const feedValues = ["rss", "atom", "feed", "rss2", "rdf"];
    for (const param of feedParams) {
      const value = parsed.searchParams.get(param);
      if (value && feedValues.includes(value.toLowerCase())) {
        return { skip: true, reason: "RSS/XML feed URL" };
      }
    }
    
    // Skip WordPress-specific non-page endpoints
    // wp-json is the REST API (returns JSON), xmlrpc.php is the RPC endpoint,
    // wp-admin and wp-login are backend access points — none are useful offline.
    if (pathLower.startsWith("/wp-json/") || pathLower === "/wp-json" ||
        pathLower.includes("/xmlrpc.php") ||
        pathLower.startsWith("/wp-admin/") || pathLower === "/wp-admin" ||
        pathLower.includes("/wp-login.php")) {
      return { skip: true, reason: "WordPress API/admin endpoint" };
    }
    
    return { skip: false };
  } catch {
    return { skip: false };
  }
}

// Map asset type to its flat output directory.
// HTML pages mirror the site's URL structure (so navigation links work).
// All other assets go into typed directories so they're easy to find offline.
const ASSET_DIR: Record<string, string> = {
  image:  "assets/images",
  css:    "assets/css",
  js:     "assets/js",
  font:   "assets/fonts",
  video:  "assets/media",
  audio:  "assets/media",
  other:  "assets/other",
};

function urlToLocalPath(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url);
    const base   = new URL(baseUrl);
    const assetType = getAssetType(url);

    // ── HTML pages: mirror the site's URL path so navigation stays intact ──
    if (assetType === "html") {
      let localPath = parsed.pathname;

      // External HTML pages go under a small external pages folder
      if (parsed.hostname !== base.hostname) {
        localPath = `_pages/${parsed.hostname}${parsed.pathname}`;
      }

      if (localPath === "/" || localPath === "") localPath = "/index.html";

      if (!path.extname(localPath)) {
        localPath = localPath.endsWith("/")
          ? `${localPath}index.html`
          : `${localPath}/index.html`;
      }

      if (parsed.search) {
        const h = crypto.createHash("md5").update(parsed.search).digest("hex").slice(0, 8);
        const ext = path.extname(localPath);
        localPath = `${localPath.slice(0, -ext.length)}_${h}${ext}`;
      }

      return localPath.replace(/^\//, "");
    }

    // ── All other assets: flat type-based directories ──
    // This keeps the ZIP clean and navigable regardless of the source CDN/domain.

    // Short hash of the full URL so same-filename files from different URLs don't collide
    const urlHash = crypto.createHash("md5").update(url).digest("hex").slice(0, 8);

    // Derive a human-readable filename from the URL
    let rawFilename = path.basename(parsed.pathname) || "file";
    try { rawFilename = decodeURIComponent(rawFilename); } catch {}
    // Keep only safe filesystem chars; cap length so paths stay short
    const safeFilename = rawFilename
      .replace(/[^\w.\-~]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 64);

    // Ensure the filename has an extension
    let ext = path.extname(safeFilename);
    if (!ext) {
      const fallbacks: Record<string, string> = {
        image: ".img", css: ".css", js: ".js", font: ".woff2",
        video: ".mp4", audio: ".mp3", other: "",
      };
      ext = fallbacks[assetType] ?? "";
    }

    const basename = ext
      ? `${path.basename(safeFilename, ext)}_${urlHash}${ext}`
      : `${safeFilename}_${urlHash}`;

    const dir = ASSET_DIR[assetType] ?? "assets/other";
    return `${dir}/${basename}`;

  } catch {
    return "assets/other/unknown";
  }
}

// Fetch headers only, with a timeout (used when we need to check content-type before reading)
async function fetchWithTimeout(url: string, timeout = 12000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WebSucker/1.0; +https://webscraper.app)",
        "Accept": "*/*",
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Per-host connection circuit breaker ------------------------------------
// Sites with aggressive firewalls (e.g. barczykinstitute.com) can BLOCK our IP
// mid-crawl after too many rapid requests. Once that happens every subsequent
// connection times out, and without a breaker the crawl burns ~12s per asset
// marking the entire rest of the job failed. Strategy:
//   1. Connection-level failures (connect timeout / refused / reset) are
//      retried with backoff, just like HTTP 429.
//   2. After the first connection failure on a host, a politeness delay is
//      inserted before every subsequent request to that host.
//   3. After several CONSECUTIVE connection failures the breaker pauses the
//      whole crawl once (~45s) to let a temporary rate-limit block lift.
//   4. If failures continue after the cooldown, the host is marked blocked and
//      remaining fetches to it fail fast with a clear, friendly error instead
//      of individually timing out.
interface HostBreakerState {
  consecutiveConnectFailures: number;
  cooldownUsed: boolean;
  blocked: boolean;
  sawConnectFailure: boolean;
}
const hostBreakers = new Map<string, HostBreakerState>();
const BREAKER_COOLDOWN_AFTER = 4;   // consecutive connect failures before pausing
const BREAKER_BLOCK_AFTER = 8;      // consecutive connect failures before giving up on host
const BREAKER_COOLDOWN_MS = 45000;  // one-time pause hoping the block lifts
const BREAKER_POLITENESS_MS = 1000; // per-request delay once a host has shown trouble

function getHostBreaker(url: string): HostBreakerState | null {
  try {
    const host = new URL(url).hostname;
    let st = hostBreakers.get(host);
    if (!st) {
      st = { consecutiveConnectFailures: 0, cooldownUsed: false, blocked: false, sawConnectFailure: false };
      hostBreakers.set(host, st);
    }
    return st;
  } catch {
    return null;
  }
}

export function resetHostBreaker(url: string): void {
  try { hostBreakers.delete(new URL(url).hostname); } catch {}
}

function isConnectError(err: unknown, breaker?: HostBreakerState | null): boolean {
  const e = err as any;
  if (!e) return false;
  // Our own timeout abort: only treat as a connection failure once the host
  // has already shown a REAL connect error — a slow-but-healthy host that
  // occasionally exceeds the fetch timeout shouldn't trip the breaker.
  if (e.name === "AbortError") return breaker?.sawConnectFailure === true;
  const msg = String(e.message || "");
  const causeCode = String(e.cause?.code || e.cause?.message || "");
  return (
    msg === "fetch failed" ||
    /UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket hang up/i.test(
      msg + " " + causeCode
    )
  );
}

const HOST_BLOCKED_MESSAGE =
  "The site stopped accepting connections from our server (its firewall likely rate-limited the crawl). " +
  "Wait a few minutes and try again — the backup will resume from scratch.";

// --- ScrapingBee plain-proxy relay for IP-blocked hosts ----------------------
// When a host firewalls OUR IP, the same request from a different IP usually
// works fine. ScrapingBee's classic (non-stealth) mode relays the request
// through their proxy pool at ~1 credit (~$0.0002) per call, so it's cheap
// enough to use for every remaining asset on a blocked host. Budget-capped
// per host to bound cost (~$0.10 worst case).
const MAX_PROXY_RELAYS_PER_HOST = 500;
const proxyRelayUsage = new Map<string, number>();

function proxyRelayBudgetLeft(host: string): boolean {
  return (proxyRelayUsage.get(host) ?? 0) < MAX_PROXY_RELAYS_PER_HOST;
}

async function fetchViaProxyRelay(
  url: string
): Promise<{ content: Buffer; contentType: string } | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return null;
  let host: string;
  try { host = new URL(url).hostname; } catch { return null; }
  if (!proxyRelayBudgetLeft(host)) {
    console.warn(`[proxy-relay] Per-host budget of ${MAX_PROXY_RELAYS_PER_HOST} reached — skipping ${url}`);
    return null;
  }
  // Count the attempt (not just successes) so cost stays bounded even if
  // some failed calls are billed or the API keeps erroring.
  const used = (proxyRelayUsage.get(host) ?? 0) + 1;
  proxyRelayUsage.set(host, used);
  if (used === 1 || used % 50 === 0) {
    console.log(`[proxy-relay] Relaying ${host} through proxy IPs (${used} requests so far)`);
  }
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render_js: "false", // plain relay — no browser, ~1 credit
    });
    const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[proxy-relay] HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ASSET_SIZE) {
      throw new Error(`Asset exceeds ${MAX_ASSET_SIZE / 1024 / 1024}MB limit`);
    }
    return { content: buf, contentType: res.headers.get("content-type") || "" };
  } catch (e: any) {
    if (/exceeds/.test(e?.message ?? "")) throw e;
    console.warn(`[proxy-relay] Request failed for ${url}: ${e?.message}`);
    return null;
  }
}

// Fetch the full response body under a single unified timeout.
// The AbortController is kept alive until the body is fully read,
// so a slow/stalled body transfer is caught just like a slow connection.
async function fetchBytesWithTimeout(
  url: string,
  timeoutMs = 12000
): Promise<{ content: Buffer; contentType: string }> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  const breaker = getHostBreaker(url);

  if (breaker?.blocked) {
    // Host firewalled our IP — relay through proxy IPs instead of giving up.
    const relayed = await fetchViaProxyRelay(url);
    if (relayed) return relayed;
    throw new Error(HOST_BLOCKED_MESSAGE);
  }
  // Politeness: once a host has shown connection trouble, slow down so we
  // don't keep tripping its rate limiter.
  if (breaker?.sawConnectFailure) {
    await new Promise(resolve => setTimeout(resolve, BREAKER_POLITENESS_MS));
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WebSucker/1.0; +https://webscraper.app)",
        "Accept": "*/*",
      },
    });

    // Rate-limited — respect Retry-After or back off exponentially, then retry.
    if (response.status === 429 && attempt < MAX_RETRIES) {
      clearTimeout(timeoutId);
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 30000)
        : Math.min(2000 * Math.pow(2, attempt), 16000); // 2s, 4s, 8s
      await new Promise(resolve => setTimeout(resolve, waitMs));
      lastError = new Error(`HTTP 429: Too Many Requests`);
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "";
    // Stream the body in chunks and enforce the size limit
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ASSET_SIZE) {
        reader.cancel();
        throw new Error(`Asset exceeds ${MAX_ASSET_SIZE / 1024 / 1024}MB limit`);
      }
      chunks.push(value);
    }
    if (breaker) breaker.consecutiveConnectFailures = 0; // healthy again
    return { content: Buffer.concat(chunks), contentType };
  } catch (err) {
    clearTimeout(timeoutId);
    if (isConnectError(err, breaker) && breaker) {
      breaker.sawConnectFailure = true;
      breaker.consecutiveConnectFailures++;
      const fails = breaker.consecutiveConnectFailures;
      if (fails >= BREAKER_BLOCK_AFTER) {
        breaker.blocked = true;
        console.warn(`[breaker] Host blocked after ${fails} consecutive connection failures: ${url}`);
        const relayed = await fetchViaProxyRelay(url);
        if (relayed) return relayed;
        throw new Error(HOST_BLOCKED_MESSAGE);
      }
      if (fails >= BREAKER_COOLDOWN_AFTER && !breaker.cooldownUsed) {
        breaker.cooldownUsed = true;
        console.warn(
          `[breaker] ${fails} consecutive connection failures — pausing ${BREAKER_COOLDOWN_MS / 1000}s ` +
          `to let a possible rate-limit block lift (${url})`
        );
        await new Promise(resolve => setTimeout(resolve, BREAKER_COOLDOWN_MS));
      }
      if (attempt < MAX_RETRIES) {
        // Back off before retrying the connection: 2s, 4s, 8s.
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * Math.pow(2, attempt), 8000)));
        lastError = err as Error;
        continue;
      }
      // Direct retries exhausted on a connection-level failure — try relaying
      // through a proxy IP before giving up on this asset.
      const relayed = await fetchViaProxyRelay(url);
      if (relayed) return relayed;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  } // end for (attempt)

  throw lastError ?? new Error("Max retries exceeded");
}

let sharedBrowser: Browser | null = null;

function findChromiumPath(): string | undefined {
  // Explicit env var takes priority
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // Try system Chromium paths
  const candidates = [
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  for (const p of candidates) {
    try {
      execSync(`test -x "${p}"`, { stdio: "ignore" });
      return p;
    } catch {}
  }
  try {
    const p = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null", { encoding: "utf-8" }).trim();
    if (p) return p;
  } catch {}
  // Fall back to Puppeteer's bundled Chromium (undefined = use default)
  return undefined;
}

// Realistic browser fingerprint pool — rotated per page to avoid pattern-based
// blocks. All UAs are recent stable Chrome on common OSes.
const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];
const ACCEPT_LANG_POOL = ["en-US,en;q=0.9", "en-US,en;q=0.8,es;q=0.5", "en-GB,en;q=0.9"];
const VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function getBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser;
  }
  const executablePath = findChromiumPath();
  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    protocolTimeout: 120000,
    timeout: 60000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      // NOTE: --no-zygote and --disable-gpu are removed; both are tells used by
      // bot-detection scripts to identify headless Chrome. Letting Chrome use
      // its normal zygote/GPU stack makes it look more like a real browser.
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
      // Removes the "Chrome is being controlled by automated test software"
      // banner *and* the navigator.webdriver=true property visible to JS.
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US,en",
    ],
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  sharedBrowser = await puppeteer.launch(launchOptions);
  return sharedBrowser;
}

async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch {}
    sharedBrowser = null;
  }
}

/**
 * Probe the entry URL with a plain fetch and decide whether Puppeteer is
 * actually needed for this site.
 *
 * Puppeteer adds value when pages are dynamically rendered (SPA) or contain
 * JS-triggered lazy loads (Wix, Squarespace, data-src embeds).
 * For plain static HTML sites (templates, documentation, etc.) Puppeteer just
 * wastes 10-20 seconds per page with no benefit.
 *
 * Returns true  → use Puppeteer (dynamic content detected)
 * Returns false → use plain fetch (static site, all content in raw HTML)
 */
/**
 * Detect Cloudflare's "Just a moment..." JS challenge / Turnstile interstitial.
 * These pages return 403/503 with cf-mitigated: challenge or contain the
 * challenge platform script. Stealth-mode Puppeteer can usually clear the
 * non-interactive variant; the interactive Turnstile cannot be bypassed.
 */
export function isCloudflareChallenge(
  html: string,
  status?: number,
  headers?: Headers | Record<string, string>,
): boolean {
  if (headers) {
    const get = (k: string) =>
      headers instanceof Headers ? headers.get(k) : (headers[k] ?? headers[k.toLowerCase()]);
    if (get("cf-mitigated") === "challenge") return true;
  }
  if (!html) return false;
  // Cloudflare-specific interstitial markers ONLY. Do not match generic words
  // like "challenge" in titles — real marketing pages use that word too.
  // The "Just a moment..." JS challenge interstitial.
  if (/<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html)) return true;
  // The challenge bootstrap object — only emitted by the interstitial.
  if (/window\._cf_chl_opt/.test(html)) return true;
  // The classic "Attention Required! | Cloudflare" block page.
  if (/<title>\s*Attention Required!\s*\|\s*Cloudflare\s*<\/title>/i.test(html)) return true;
  // Firewall-block page ("Sorry, you have been blocked" + Cloudflare branding).
  if (/Sorry, you have been blocked[\s\S]{0,500}Cloudflare/i.test(html)) return true;
  // Cloudflare error pages embed a `cf-error-details` block with Ray ID.
  if (/<div[^>]+class=["']cf-error-details/i.test(html)) return true;
  return false;
}

async function probeNeedsPuppeteer(entryUrl: string): Promise<boolean> {
  try {
    // Request only the first 32KB — enough to detect all framework/CMS markers
    // without downloading the full page. Much faster on slow production networks.
    const res = await fetch(entryUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WebsiteSucker/1.0)",
        "Range": "bytes=0-32767",
      },
      signal: AbortSignal.timeout(20000),
    });
    // Cloudflare challenge → must use Puppeteer (with stealth) to clear it.
    if (isCloudflareChallenge("", res.status, res.headers)) return true;
    // 206 = range accepted, 200 = server ignored Range header (full response)
    if (res.status !== 200 && res.status !== 206) return true;
    const html = await res.text();
    if (isCloudflareChallenge(html, res.status, res.headers)) return true;

    // 1. SPA: near-empty body with known root mount points
    if (/<div[^>]+id=["'](?:root|app)["'][^>]*>\s*<\/div>/i.test(html)) return true;

    // 2. Angular
    if (/ng-version|<app-root/i.test(html)) return true;

    // 3. Next.js / Nuxt / similar SSR frameworks that hydrate client-side
    if (/__NEXT_DATA__|__nuxt|data-reactroot/i.test(html)) return true;

    // 4. Wix
    if (/wixstatic\.com|data-mesh-id|wix-code-sdk|<wix-image/i.test(html)) return true;

    // 5. Squarespace
    if (/squarespace\.com|squarespace-cdn\.com/i.test(html)) return true;

    // 6. JS-based lazy loading (data-src on 5+ elements = definitely needs scroll)
    const dataSrcCount = (html.match(/\bdata-src=["'][^"']+["']/g) || []).length;
    if (dataSrcCount >= 5) return true;

    // 7. Suspiciously small body → probably a SPA shell.
    // Only consider the first 32KB, so threshold is lower than a full-page check.
    const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length < 200) return true;

    // Static HTML — Puppeteer won't add anything useful
    return false;
  } catch {
    return true; // fetch failed → fall back to Puppeteer to be safe
  }
}

/**
 * Bypass a Cloudflare Turnstile challenge using CapSolver (paid CAPTCHA-solver
 * API). Returns true if the challenge was successfully solved and the page is
 * now on the real content. Returns false if no API key is configured, the
 * sitekey can't be detected, or the solve attempt fails.
 *
 * Cost: ~$0.0015 per solve. Only invoked as a last resort after stealth +
 * humanlike interaction fail to clear the challenge.
 */
async function trySolveTurnstileWithCapSolver(
  page: import("puppeteer").Page,
  pageUrl: string,
): Promise<boolean> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) return false;

  try {
    // Try to extract the Turnstile sitekey from the page. Cloudflare
    // interstitials may expose it as: data-sitekey, iframe src param,
    // or buried in the raw HTML/script source.
    const extracted = await page.evaluate(() => {
      const el = document.querySelector("[data-sitekey]") as HTMLElement | null;
      if (el?.dataset.sitekey) return { sitekey: el.dataset.sitekey, source: "data-sitekey" };
      const iframe = document.querySelector(
        'iframe[src*="challenges.cloudflare.com"]'
      ) as HTMLIFrameElement | null;
      if (iframe?.src) {
        const m = iframe.src.match(/[?&]k=([^&]+)/) || iframe.src.match(/[?&]sitekey=([^&]+)/);
        if (m) return { sitekey: decodeURIComponent(m[1]), source: "iframe-src" };
      }
      // Fallback: scan raw HTML for a 0x...-prefixed Turnstile key (32 chars).
      const html = document.documentElement.outerHTML;
      const keyMatch = html.match(/(?:sitekey|0x[A-Za-z0-9]{20,40})['"]?\s*[:=]\s*['"]?(0x[A-Za-z0-9_-]{20,40})/);
      if (keyMatch) return { sitekey: keyMatch[1], source: "html-regex" };
      const bareKey = html.match(/(0x4[A-Z0-9]{20,40})/);
      if (bareKey) return { sitekey: bareKey[1], source: "html-bare" };
      return null;
    });
    if (!extracted) {
      console.log(`[capsolver] No Turnstile sitekey found on ${pageUrl} — Cloudflare interstitial likely uses an internal challenge that CapSolver's AntiTurnstileTaskProxyLess can't solve. Try AntiCloudflareTask with a residential proxy if you have one.`);
      return false;
    }
    const sitekey = extracted.sitekey;
    console.log(`[capsolver] Found sitekey via ${extracted.source}: ${sitekey.slice(0, 12)}…`);

    console.log(`[capsolver] Submitting Turnstile task for ${pageUrl} (sitekey ${sitekey.slice(0, 10)}…)`);
    const createRes = await fetch("https://api.capsolver.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: "AntiTurnstileTaskProxyLess",
          websiteURL: pageUrl,
          websiteKey: sitekey,
        },
      }),
    });
    const createJson = await createRes.json();
    if (createJson.errorId !== 0 || !createJson.taskId) {
      console.warn(`[capsolver] createTask failed:`, createJson.errorDescription || createJson);
      return false;
    }
    const taskId = createJson.taskId;

    // Poll for result (CapSolver typically takes 5-30s for Turnstile)
    const pollStart = Date.now();
    let token: string | null = null;
    while (Date.now() - pollStart < 90000) {
      await new Promise(r => setTimeout(r, 3000));
      const res = await fetch("https://api.capsolver.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });
      const json = await res.json();
      if (json.status === "ready" && json.solution?.token) {
        token = json.solution.token;
        break;
      }
      if (json.errorId !== 0) {
        console.warn(`[capsolver] getTaskResult error:`, json.errorDescription);
        return false;
      }
    }
    if (!token) return false;

    // Inject the token. Cloudflare's challenge looks for the token via the
    // global turnstile callback OR a hidden input named cf-turnstile-response.
    // We try both, then submit the form.
    await page.evaluate((tok: string) => {
      const input = document.querySelector(
        'input[name="cf-turnstile-response"]'
      ) as HTMLInputElement | null;
      if (input) input.value = tok;
      const w = window as any;
      try {
        if (w.turnstile?.callback) w.turnstile.callback(tok);
      } catch {}
      // Most CF challenge pages auto-submit when the token is set.
    }, token);

    console.log(`[capsolver] Token injected, waiting for navigation…`);
    // Wait up to 15s for the page to navigate past the challenge
    try {
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });
    } catch {}
    return true;
  } catch (err) {
    console.warn(`[capsolver] Bypass attempt failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Final-resort Cloudflare bypass via ScrapingBee. Their premium proxy farm +
 * managed Chrome handles Cloudflare's "Managed Challenge" interstitial that
 * proxyless CAPTCHA solvers can't touch (the sitekey is generated inside
 * Cloudflare's protected iframe and never exposed to the page DOM).
 *
 * Cost: ~25 credits per premium request (~$0.005). Only invoked after stealth
 * + humanlike + CapSolver have all failed and SCRAPINGBEE_API_KEY is set.
 */
// Hard cap on paid ScrapingBee calls per scrape job to bound cost. At ~75
// credits (~$0.015) per call, this caps a single job at ~$0.075.
const MAX_SCRAPINGBEE_FALLBACKS_PER_JOB = 5;
const scrapingBeeUsage = new Map<string, number>();

function getScrapingBeeUsage(jobId?: string): number {
  if (!jobId) return 0;
  return scrapingBeeUsage.get(jobId) ?? 0;
}

function bumpScrapingBeeUsage(jobId?: string): void {
  if (!jobId) return;
  scrapingBeeUsage.set(jobId, (scrapingBeeUsage.get(jobId) ?? 0) + 1);
}

export function resetScrapingBeeUsage(jobId: string): void {
  scrapingBeeUsage.delete(jobId);
}

async function tryScrapingBeeFallback(
  url: string,
  jobId?: string,
): Promise<string | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return null;
  if (jobId && getScrapingBeeUsage(jobId) >= MAX_SCRAPINGBEE_FALLBACKS_PER_JOB) {
    console.warn(
      `[scrapingbee] Per-job budget of ${MAX_SCRAPINGBEE_FALLBACKS_PER_JOB} reached for job ${jobId} — skipping ${url}`
    );
    return null;
  }

  try {
    console.log(`[scrapingbee] Attempting stealth-proxy fallback for ${url}`);
    // stealth_proxy is ScrapingBee's strongest mode — it's specifically built
    // to defeat Cloudflare's Managed Challenge (the kind premium_proxy can't
    // handle). Costs ~75 credits per request (~$0.015) but is the only mode
    // that reliably works on sites like gregorypalmerdmd.com.
    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render_js: "true",
      stealth_proxy: "true",
      country_code: "us",
      wait_browser: "networkidle2",
    });
    const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
      method: "GET",
      // Stealth-proxy requests can take 30-90s; allow generous timeout.
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[scrapingbee] HTTP ${res.status}: ${body.slice(0, 300)}`
      );
      return null;
    }
    const html = await res.text();
    if (!html || html.length < 100) {
      console.warn(
        `[scrapingbee] Empty/tiny response (${html.length} bytes): ${html.slice(0, 200)}`
      );
      return null;
    }
    if (isCloudflareChallenge(html)) {
      console.warn(
        `[scrapingbee] Returned a still-challenged page (${html.length} bytes). ` +
        `First 200 chars: ${html.slice(0, 200).replace(/\s+/g, " ")}`
      );
      return null;
    }
    bumpScrapingBeeUsage(jobId);
    console.log(
      `[scrapingbee] Success — got ${html.length} bytes of real HTML ` +
      `(job usage: ${getScrapingBeeUsage(jobId)}/${MAX_SCRAPINGBEE_FALLBACKS_PER_JOB})`
    );
    return html;
  } catch (err) {
    console.warn(
      `[scrapingbee] Request failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Robust auto-scroll for a Puppeteer page. Drives the main document AND any
 * inner scroll containers to the bottom, repeating while the page keeps growing
 * (infinite scroll). Hard-capped by iteration count and wall-clock time so it
 * can never hang, no matter how the page behaves.
 */
/**
 * Rough "content richness" score for an HTML document: visible text length
 * plus a weight per <img>. Used to detect renders that LOST content versus
 * the raw server HTML (e.g. Wix/React hydration wiping SSR content before
 * the client re-render finishes).
 */
function htmlContentScore(html: string): { textLen: number; imgCount: number; iframeCount: number; navLinkCount: number } {
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();
    const textLen = $("body").text().replace(/\s+/g, " ").trim().length;
    const imgCount = $("img").length;
    const iframeCount = $("iframe").length;
    const navLinkCount = $("nav a, [role='navigation'] a").length;
    return { textLen, imgCount, iframeCount, navLinkCount };
  } catch {
    return { textLen: 0, imgCount: 0, iframeCount: 0, navLinkCount: 0 };
  }
}

/**
 * Graft JS-created <iframe> embeds from the rendered DOM into raw server HTML.
 * Used when we fall back to raw HTML (rendered capture lost text content) but
 * the rendered DOM contains embeds (Wix HtmlComponent, maps, widgets) that the
 * raw HTML lacks. Matches each iframe's nearest ancestor with an id that also
 * exists in the raw HTML and inserts the iframe there.
 */
function mergeRenderedIframes(rawHtml: string, renderedHtml: string): string {
  try {
    const $raw = cheerio.load(rawHtml);
    const $rendered = cheerio.load(renderedHtml);
    const rawSrcs = new Set(
      $raw("iframe").map((_, el) => $raw(el).attr("src") || "").get()
    );
    let merged = false;
    $rendered("iframe").each((_, el) => {
      const $el = $rendered(el);
      const src = $el.attr("src") || "";
      if (!src || rawSrcs.has(src)) return;
      // Find the nearest rendered ancestor whose id also exists in the raw doc,
      // remembering the child subtree of that ancestor which holds the iframe.
      // Grafting the WHOLE wrapper subtree (not the bare iframe) preserves the
      // sizing/positioning wrapper divs — a bare 100%x100% absolute iframe
      // dropped straight into a section container paints over sibling content.
      let target: ReturnType<typeof $raw> | null = null;
      let subtree = $el;
      let cur = $el.parent();
      while (cur.length) {
        const id = cur.attr("id");
        if (id) {
          const inRaw = $raw(`#${id.replace(/([^\w-])/g, "\\$1")}`);
          if (inRaw.length) { target = inRaw.first(); break; }
        }
        subtree = cur;
        cur = cur.parent();
      }
      // Skip if the raw doc already has the subtree root (avoid duplicates).
      const subtreeId = subtree.attr("id");
      if (subtreeId && $raw(`#${subtreeId.replace(/([^\w-])/g, "\\$1")}`).length) return;
      const graftHtml = $rendered.html(subtree);
      if (target) {
        target.append(graftHtml);
      } else {
        $raw("body").append(graftHtml);
      }
      merged = true;
    });
    return merged ? $raw.html() : rawHtml;
  } catch {
    return rawHtml;
  }
}

async function robustAutoScroll(page: import("puppeteer").Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const docHeight = () => Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0,
      document.body?.offsetHeight || 0,
      document.documentElement?.offsetHeight || 0,
    );

    // Find inner scroll containers (overflow auto/scroll with real overflow).
    const scrollContainers: HTMLElement[] = [];
    try {
      const all = Array.from(document.querySelectorAll<HTMLElement>("*")).slice(0, 3000);
      for (const el of all) {
        const style = getComputedStyle(el);
        const oy = style.overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 200) {
          scrollContainers.push(el);
          if (scrollContainers.length >= 8) break;
        }
      }
    } catch {}

    const start = Date.now();
    const MAX_MS = 20000;
    const MAX_ITERS = 60;
    const distance = 800;
    let lastHeight = 0;
    let stableCount = 0;

    for (let i = 0; i < MAX_ITERS; i++) {
      if (Date.now() - start > MAX_MS) break;

      window.scrollBy(0, distance);
      for (const c of scrollContainers) {
        try { c.scrollTop += distance; } catch {}
      }
      await sleep(120);

      const atBottom = window.innerHeight + window.scrollY >= docHeight() - 2;
      const h = docHeight();
      if (h === lastHeight) {
        stableCount++;
        // Height stopped growing AND we're at the bottom → done.
        if (atBottom && stableCount >= 2) break;
        if (stableCount >= 5) break;
      } else {
        stableCount = 0;
        lastHeight = h;
      }
    }
  });
}

/**
 * Non-destructive interaction sweep. Best-effort hover over nav/menu triggers
 * and open collapsible UI (tabs, accordions, "show more", <details>) so lazily-
 * injected content and assets get added to the DOM. Strictly guarded so it
 * NEVER navigates away, submits a form, or throws.
 */
async function interactionSweep(page: import("puppeteer").Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const fire = (el: Element, type: string) => {
      try {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      } catch {}
    };

    // 1. Hover navigation / menu triggers to reveal dropdown submenus.
    try {
      const hoverTargets = Array.from(document.querySelectorAll<HTMLElement>(
        "nav a, nav button, nav li, [class*='menu'] > a, [class*='menu'] > button, [class*='nav'] li, [aria-haspopup]"
      )).slice(0, 40);
      for (const el of hoverTargets) {
        fire(el, "mouseover");
        fire(el, "mouseenter");
      }
      await sleep(300);
    } catch {}

    // 2. Open collapsible UI that reveals content, guarded against navigation.
    try {
      // Native <details> — safe to open directly.
      document.querySelectorAll<HTMLDetailsElement>("details").forEach(d => {
        try { d.open = true; } catch {}
      });

      // Only target elements with EXPLICIT expand/collapse semantics — never a
      // bare `button` (those can carry JS navigation handlers). Elements must
      // also expose a safe toggle signal (aria-controls / aria-expanded / a
      // known accordion|tab|show-more class).
      const clickTargets = Array.from(document.querySelectorAll<HTMLElement>(
        "[role='tab'], [aria-expanded='false'], [aria-controls][role='button'], " +
        "[class*='accordion']:not(a), [class*='collapse']:not(a), " +
        "[class*='show-more']:not(a), [class*='load-more']:not(a), [class*='read-more']:not(a)"
      )).slice(0, 60);

      for (const el of clickTargets) {
        const tag = el.tagName.toLowerCase();
        // Never touch links or anything that acts like a link.
        if (tag === "a" || el.hasAttribute("href")) continue;
        if (el.getAttribute("role") === "link") continue;
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "submit" || type === "reset") continue;
        if (el.closest("form")) continue;
        // Require a genuine toggle signal so we don't click arbitrary controls.
        const hasToggleSignal =
          el.hasAttribute("aria-controls") ||
          el.hasAttribute("aria-expanded") ||
          el.getAttribute("role") === "tab" ||
          /accordion|collapse|show-more|load-more|read-more/i.test(el.className || "");
        if (!hasToggleSignal) continue;
        const label = (el.textContent || "").trim().toLowerCase();
        // Avoid destructive / navigational actions.
        if (/sign|log ?in|log ?out|buy|checkout|pay|delete|remove|subscribe|submit|next|previous|prev/.test(label)) continue;

        fire(el, "click");
      }
      await sleep(500);
    } catch {}
  });
}

/**
 * Collect asset URLs referenced by the currently-rendered DOM. Used for the
 * mobile-viewport pass to discover responsive/mobile-only assets. Returns
 * absolute URLs (img currentSrc/src, srcset candidates, <source>, video/audio,
 * poster, and computed background images).
 */
async function collectRenderedAssetUrls(page: import("puppeteer").Page): Promise<string[]> {
  return page.evaluate(() => {
    const urls = new Set<string>();
    const add = (v?: string | null) => {
      if (!v) return;
      const s = v.trim();
      if (!s || s.startsWith("data:") || s.startsWith("blob:")) return;
      try { urls.add(new URL(s, document.baseURI).href); } catch {}
    };
    const addSrcset = (v?: string | null) => {
      if (!v) return;
      v.split(",").forEach(part => add(part.trim().split(/\s+/)[0]));
    };

    document.querySelectorAll("img").forEach(img => {
      add((img as HTMLImageElement).currentSrc);
      add(img.getAttribute("src"));
      addSrcset(img.getAttribute("srcset"));
    });
    document.querySelectorAll("source").forEach(s => {
      add(s.getAttribute("src"));
      addSrcset(s.getAttribute("srcset"));
    });
    document.querySelectorAll("video, audio").forEach(m => {
      add(m.getAttribute("src"));
      add(m.getAttribute("poster"));
    });

    // Computed background images (catches media-query backgrounds).
    const els = Array.from(document.querySelectorAll<HTMLElement>("*")).slice(0, 4000);
    for (const el of els) {
      let bg = "";
      try { bg = getComputedStyle(el).backgroundImage; } catch {}
      if (bg && bg !== "none") {
        const re = /url\((['"]?)(.*?)\1\)/g;
        let m;
        while ((m = re.exec(bg)) !== null) add(m[2]);
      }
    }
    return Array.from(urls);
  });
}

async function fetchRenderedHtml(url: string, timeout = 45000, jobId?: string): Promise<{ html: string; status: number; extraAssetUrls?: string[] }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    // Rotate fingerprint per request: realistic UA, viewport, and language.
    const ua = pick(UA_POOL);
    const acceptLang = pick(ACCEPT_LANG_POOL);
    const viewport = pick(VIEWPORT_POOL);
    await page.setUserAgent(ua);
    await page.setViewport(viewport);
    await page.setExtraHTTPHeaders({
      "Accept-Language": acceptLang,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Sec-Ch-Ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": ua.includes("Windows") ? '"Windows"' : ua.includes("Mac") ? '"macOS"' : '"Linux"',
      "Upgrade-Insecure-Requests": "1",
    });
    
    // Use "load" instead of "networkidle2" — fires when load event fires rather than
    // waiting for ALL network requests to settle (which can take 10-30s on Wix/analytics-heavy sites).
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout,
    }).catch(async () => {
      // If load times out, try domcontentloaded as last resort
      return page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
    });
    
    let status = response?.status() || 200;

    // Cloudflare "Just a moment..." challenge: even after Puppeteer navigation,
    // the response is the challenge page (HTTP 403 + cf-mitigated: challenge).
    // With the stealth plugin the non-interactive challenge often clears
    // automatically within 5-10s. For interactive Turnstile, simulate human
    // mouse movement + click the checkbox iframe to trigger pass.
    const cfHeaders = response?.headers() ?? {};
    let html = await page.content();
    // Only enter the Cloudflare bypass path when the page actually looks like
    // a Cloudflare challenge. Generic 403/503 (auth wall, geo-block, plain
    // WAF, maintenance) must propagate as failure — otherwise we'd silently
    // rewrite their status to 200 below and return error HTML as success.
    if (isCloudflareChallenge(html, status, cfHeaders)) {
      // Humanlike interaction: random mouse movement to satisfy
      // "real browser" heuristics, then attempt to click any Turnstile iframe.
      try {
        for (let i = 0; i < 6; i++) {
          await page.mouse.move(
            200 + Math.random() * 800,
            200 + Math.random() * 400,
            { steps: 8 }
          );
          await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
        }
      } catch {}

      const cfStart = Date.now();
      let clickedCheckbox = false;
      while (Date.now() - cfStart < 45000) {
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Try clicking the Turnstile checkbox once (if present). The checkbox
        // lives inside a cross-origin iframe at challenges.cloudflare.com; we
        // can't reach into it via DOM, but clicking at the iframe's screen
        // coords triggers the same event.
        if (!clickedCheckbox) {
          try {
            const box = await page.evaluate(() => {
              const iframe = document.querySelector(
                'iframe[src*="challenges.cloudflare.com"]'
              ) as HTMLIFrameElement | null;
              if (!iframe) return null;
              const r = iframe.getBoundingClientRect();
              return { x: r.x, y: r.y, w: r.width, h: r.height };
            });
            if (box && box.w > 0 && box.h > 0) {
              // Cloudflare's checkbox sits ~30px from the left edge of the widget.
              await page.mouse.move(box.x + 30, box.y + box.h / 2, { steps: 12 });
              await new Promise(r => setTimeout(r, 400));
              await page.mouse.click(box.x + 30, box.y + box.h / 2);
              clickedCheckbox = true;
            }
          } catch {}
        }

        try {
          html = await page.content();
        } catch {
          break;
        }
        if (!isCloudflareChallenge(html)) {
          status = 200; // challenge cleared — Puppeteer is now on the real page
          break;
        }
      }
      // Last resort #1: if stealth + humanlike interaction failed AND a
      // CapSolver API key is configured, pay to solve a standalone Turnstile
      // widget (works only when the sitekey is exposed in the page DOM).
      if (isCloudflareChallenge(html)) {
        const solved = await trySolveTurnstileWithCapSolver(page, url);
        if (solved) {
          try {
            html = await page.content();
            if (!isCloudflareChallenge(html)) status = 200;
          } catch {}
        }
      }
      // Last resort #2: if everything else failed AND ScrapingBee is
      // configured, route the request through their premium-proxy farm to
      // bypass even Cloudflare's "Managed Challenge" interstitial mode.
      if (isCloudflareChallenge(html)) {
        const beeHtml = await tryScrapingBeeFallback(url, jobId);
        if (beeHtml) {
          html = beeHtml;
          status = 200;
          // ScrapingBee returned the rendered HTML directly. Skip the
          // Puppeteer scroll/lazy-load step below since we no longer have
          // the real page in `page` — assets will be discovered by the
          // downstream cheerio-based parser.
          return { html, status };
        }
      }
      if (isCloudflareChallenge(html)) {
        throw new Error(
          "This site is protected by Cloudflare's bot challenge and cannot be scraped. " +
          "Ask the site owner to allow our user agent, or contact us if you own the site."
        );
      }
    }

    if (status >= 400) {
      return { html: "", status };
    }
    
    // Short settle wait after load event
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Hydration settle: SPA frameworks (Wix/React) can WIPE the server-rendered
    // content during hydration and re-render it client-side. Capturing mid-wipe
    // produces a page with empty text nodes. Poll the visible text length until
    // it stabilizes (or a hard cap) so we never capture mid-hydration.
    try {
      let lastLen = -1;
      let stable = 0;
      const hydrateStart = Date.now();
      while (Date.now() - hydrateStart < 15000) {
        // Track iframes as well as text: Wix HtmlComponent embeds attach their
        // <iframe> late in hydration — text can be stable while the embed is
        // still missing, and capturing then loses it.
        const len = await page.evaluate(
          () => (document.body?.innerText || "").length
            + document.querySelectorAll("iframe").length * 5000
            + document.querySelectorAll("nav a, [role='navigation'] a").length * 500
        );
        if (len === lastLen && len > 0) {
          stable++;
          if (stable >= 2) break; // unchanged across 2 consecutive polls → settled
        } else {
          stable = 0;
          lastLen = len;
        }
        await new Promise(resolve => setTimeout(resolve, 700));
      }
    } catch {}

    // --- Capture-fidelity passes (Puppeteer-only) -------------------------
    // Each pass is wrapped in try/catch so any failure degrades gracefully to
    // the previous behaviour instead of aborting the whole render.

    // Pass 1: robust auto-scroll — trigger lazy-loaded images/embeds. Uses the
    // real document/element scroll height (not just document.body), also drives
    // any inner scroll containers, and keeps going while the page keeps growing
    // (infinite scroll). Hard-capped by iterations + wall-clock time so it can
    // never hang.
    await robustAutoScroll(page).catch(() => {});

    // Wait for lazy-loaded content to appear. Below-the-fold embeds (e.g. Wix
    // contact forms) often only mount AFTER the auto-scroll brings them into
    // view, and then take a few seconds to attach their iframe and load it.
    // Poll iframe count + text length until stable again instead of a fixed
    // short delay, then give attached iframes a chance to finish loading.
    try {
      let lastLen = -1;
      let stable = 0;
      const lazyStart = Date.now();
      while (Date.now() - lazyStart < 8000) {
        const len = await page.evaluate(
          () => (document.body?.innerText || "").length
            + document.querySelectorAll("iframe").length * 5000
        );
        if (len === lastLen && len > 0) {
          stable++;
          if (stable >= 2) break;
        } else {
          stable = 0;
          lastLen = len;
        }
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      // Wait (bounded) for any iframes that are still loading their content.
      await page.evaluate(() => new Promise<void>((resolve) => {
        const frames = Array.from(document.querySelectorAll("iframe"));
        if (frames.length === 0) return resolve();
        let pending = frames.length;
        const done = () => { if (--pending <= 0) resolve(); };
        const timer = setTimeout(() => resolve(), 5000);
        for (const f of frames) {
          try {
            // Same-origin frames with a complete document are already done;
            // cross-origin access throws, so fall back to the load event.
            const doc = (f as HTMLIFrameElement).contentDocument;
            if (doc && doc.readyState === "complete") { done(); continue; }
          } catch {}
          f.addEventListener("load", done, { once: true });
          f.addEventListener("error", done, { once: true });
        }
        if (pending <= 0) { clearTimeout(timer); resolve(); }
      }));
    } catch {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Pass 2: non-destructive interaction sweep — hover nav/menu triggers and
    // open collapsible UI (tabs, accordions, "show more", <details>) so any
    // lazily-injected content/assets get added to the DOM. Guaranteed never to
    // navigate away, submit a form, or throw. As defense-in-depth, if any
    // interaction still manages to navigate the page, we detect the URL change
    // and restore the original page before capturing HTML.
    const urlBeforeSweep = page.url();
    // Compare ignoring the hash — in-page tab/anchor changes (#section) are not
    // real navigation and must not trigger a needless reload.
    const stripHash = (u: string) => { try { const p = new URL(u); return p.origin + p.pathname + p.search; } catch { return u; } };
    await interactionSweep(page).catch(() => {});
    if (stripHash(page.url()) !== stripHash(urlBeforeSweep)) {
      console.warn(`[render] interaction sweep navigated away (${page.url()}); restoring ${urlBeforeSweep}`);
      await page.goto(urlBeforeSweep, { waitUntil: "load", timeout: 20000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Re-run lazy discovery after interactions revealed new content.
    await robustAutoScroll(page).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

    // Brief network idle check
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 }).catch(() => {});

    // Desktop DOM is the primary offline copy we save.
    html = await page.content();

    // Pass 3: multi-viewport asset pass — re-render at a mobile viewport so
    // responsive/mobile-only assets (<picture> media sources, mobile srcset
    // candidates, media-query background images, and JS-injected mobile-only
    // DOM) get loaded, then collect any newly-referenced asset URLs. These are
    // returned to the caller to be downloaded so the offline copy looks right
    // at any screen size. We do NOT overwrite the desktop HTML.
    let extraAssetUrls: string[] | undefined;
    try {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      // Nudge the page to re-evaluate responsive images / media queries.
      await page.evaluate(() => window.dispatchEvent(new Event("resize"))).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
      await robustAutoScroll(page).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1500));
      await page.waitForNetworkIdle({ idleTime: 800, timeout: 4000 }).catch(() => {});
      extraAssetUrls = await collectRenderedAssetUrls(page).catch(() => [] as string[]);
    } catch {
      // Mobile pass is best-effort; ignore failures.
    }

    return { html, status, extraAssetUrls };
  } finally {
    await page.close();
  }
}

export async function scrapeWebsite(options: ScrapeOptions): Promise<string> {
  const { jobId, url, onProgress } = options;
  const baseUrl = new URL(url);
  const baseHost = baseUrl.hostname;
  
  // SSRF protection - block internal/private hosts
  if (isBlockedHost(baseHost)) {
    throw new Error("Cannot scrape internal or private network addresses");
  }
  
  // Only allow HTTP/HTTPS
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }
  
  // Fresh circuit-breaker state for this job — a host block observed during a
  // previous scrape shouldn't poison a fresh attempt (blocks are usually
  // temporary rate limits that lift after a few minutes).
  resetHostBreaker(url);

  const discoveredUrls = new Set<string>();
  const processedUrls = new Set<string>();
  const urlQueue: Array<{ url: string; referrer: string }> = [{ url, referrer: "Entry point" }];
  const assetMap = new Map<string, Asset>();
  let htmlPagesProcessed = 0;
  
  const outputDir = `/tmp/scrape-${jobId}`;
  await fs.promises.mkdir(outputDir, { recursive: true });

  // Probe the entry URL once to decide whether Puppeteer is needed at all.
  // Static HTML sites (templates, docs, etc.) skip Puppeteer entirely,
  // reducing per-page render time from ~15s to ~300ms.
  const usePuppeteer = await probeNeedsPuppeteer(url);
  console.log(`[${jobId}] Site probe: ${usePuppeteer ? "dynamic (Puppeteer ON)" : "static (Puppeteer OFF)"} — ${url}`);

  const sendProgress = () => {
    const job = {
      jobId,
      status: "scraping" as const,
      totalAssets: assetMap.size,
      processedAssets: Array.from(assetMap.values()).filter(
        a => a.status === "success" || a.status === "failed" || a.status === "skipped"
      ).length,
      successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
      failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
    };
    onProgress(job);
  };

  // Track Wix CDN base URLs already downloaded so we don't re-download every
  // transformation variant (1x, 2x, different sizes) of the same image.
  const wixBaseDownloaded = new Map<string, Asset>(); // baseUrl -> asset

  // Process HTML pages first, then other assets
  while (urlQueue.length > 0) {
    // Enforce asset limit
    if (assetMap.size >= MAX_ASSETS) {
      onProgress({
        jobId,
        status: "scraping",
        totalAssets: assetMap.size,
        processedAssets: assetMap.size,
        successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
        failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
        message: `Asset limit reached (${MAX_ASSETS}). Finishing up...`,
      });
      break;
    }
    
    const queueItem = urlQueue.shift()!;
    const currentUrl = queueItem.url;
    const currentReferrer = queueItem.referrer;
    
    if (processedUrls.has(currentUrl)) continue;
    processedUrls.add(currentUrl);
    
    // Check for blocked hosts in discovered URLs
    try {
      const parsedUrl = new URL(currentUrl);
      if (isBlockedHost(parsedUrl.hostname)) {
        continue;
      }
    } catch {
      continue;
    }
    
    // Wix CDN: normalise transformation URLs to the base image URL so we download
    // the original PNG/JPEG instead of an AVIF-encoded file with the wrong extension,
    // and so all resize variants (1x, 2x, etc.) share a single clean local path.
    // Pattern: https://static.wixstatic.com/media/{HASH}/v1/{mode}/{params}/{filename}
    //       => https://static.wixstatic.com/media/{HASH}
    let downloadUrl = currentUrl;
    if (currentUrl.includes("static.wixstatic.com/media/") && currentUrl.includes("/v1/")) {
      const hash = extractWixMediaHash(currentUrl);
      if (hash) {
        const baseUrl = `https://static.wixstatic.com/media/${hash}`;
        const existingAsset = wixBaseDownloaded.get(baseUrl);
        if (existingAsset) {
          // Already downloaded this image under another transformation variant.
          // Alias this URL to the existing asset so rewriteUrls can find it directly.
          assetMap.set(currentUrl, existingAsset);
          continue;
        }
        // Not yet downloaded — redirect the download to the base (non-transformed) URL.
        downloadUrl = baseUrl;
      }
    }

    const assetType = getAssetType(downloadUrl);
    const localPath = urlToLocalPath(downloadUrl, url);
    const isExternal = isExternalUrl(downloadUrl, baseHost);
    
    // Create asset record with referrer tracking
    let asset = await storage.addAsset(jobId, {
      type: assetType,
      originalUrl: downloadUrl,
      localPath,
      status: "downloading",
      referencedFrom: currentReferrer,
    });
    assetMap.set(currentUrl, asset);
    // For Wix CDN normalised URLs, also index by the base URL
    if (downloadUrl !== currentUrl) {
      assetMap.set(downloadUrl, asset);
    }
    
    onProgress({
      jobId,
      status: "scraping",
      currentAsset: asset,
      totalAssets: assetMap.size,
      processedAssets: Array.from(assetMap.values()).filter(
        a => a.status === "success" || a.status === "failed" || a.status === "skipped"
      ).length,
      successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
      failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
      message: `Downloading: ${currentUrl}`,
    }, asset);
    
    // Skip analytics/tracking scripts and feed URLs
    const skipCheck = shouldSkipUrl(downloadUrl);
    if (skipCheck.skip) {
      asset = (await storage.updateAsset(jobId, asset.id, {
        status: "skipped",
        error: skipCheck.reason || "Skipped URL",
      }))!;
      assetMap.set(currentUrl, asset);
      onProgress({
        jobId,
        status: "scraping",
        currentAsset: asset,
        totalAssets: assetMap.size,
        processedAssets: Array.from(assetMap.values()).filter(
          a => a.status === "success" || a.status === "failed" || a.status === "skipped"
        ).length,
        successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
        failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
        message: `Skipped: ${currentUrl}`,
      }, asset);
      continue;
    }

    try {
      let content: Buffer;
      let contentType = "";
      
      // If the host's circuit breaker has tripped, skip Puppeteer entirely —
      // the browser can't use the proxy relay, so go straight to
      // fetchBytesWithTimeout which relays blocked hosts through proxy IPs
      // (or fails fast with a friendly message when no relay is available).
      const hostBreaker = getHostBreaker(downloadUrl);
      const hostIsBlocked = hostBreaker?.blocked === true;

      if (assetType === "html" && !isExternal) {
        if (usePuppeteer && !hostIsBlocked) {
          try {
            const rendered = await fetchRenderedHtml(currentUrl, 45000, jobId);
            
            if (rendered.status >= 400) {
              throw new Error(`HTTP ${rendered.status}`);
            }
            
            if (!rendered.html || rendered.html.length < 50) {
              throw new Error("Empty or invalid page content");
            }
            
            // Content-loss guard: hydration on SPA builders (Wix, etc.) can wipe
            // the server-rendered content and leave the captured DOM emptier than
            // the raw HTML the server sent. Compare richness and keep whichever
            // version actually contains the content.
            let chosenHtml = rendered.html;
            try {
              const renderedScore = htmlContentScore(rendered.html);
              // Only pay for the extra raw fetch when the rendered capture looks
              // suspiciously thin — a fully rendered page with plenty of text and
              // images can't have "lost" content worth restoring.
              if (renderedScore.textLen < 2000 || renderedScore.imgCount < 5 || renderedScore.navLinkCount === 0) {
                const rawFetch = await fetchBytesWithTimeout(downloadUrl);
                if (rawFetch.contentType.includes("text/html")) {
                  const rawHtml = rawFetch.content.toString("utf-8");
                  const rawScore = htmlContentScore(rawHtml);
                  const lostText = rawScore.textLen > 500 && renderedScore.textLen < rawScore.textLen * 0.6;
                  const lostImgs = rawScore.imgCount >= 5 && renderedScore.imgCount < rawScore.imgCount * 0.5;
                  // Wix menus render their items late; a capture can save the
                  // nav with an EMPTY <ul> while the raw SSR HTML has the full
                  // menu. Treat "raw has nav links, rendered has none" as loss.
                  const lostNav = rawScore.navLinkCount >= 2 && renderedScore.navLinkCount === 0;
                  if (lostText || lostImgs || lostNav) {
                    console.warn(
                      `[render] rendered DOM lost content vs raw HTML for ${currentUrl} ` +
                      `(text ${renderedScore.textLen} vs ${rawScore.textLen}, imgs ${renderedScore.imgCount} vs ${rawScore.imgCount}, navLinks ${renderedScore.navLinkCount} vs ${rawScore.navLinkCount}) — using raw server HTML`
                    );
                    // Raw server HTML never contains JS-created embeds (Wix
                    // HtmlComponent, maps, widgets); graft any iframes the
                    // rendered DOM had into the raw HTML so we don't trade the
                    // text for the embed.
                    chosenHtml = renderedScore.iframeCount > rawScore.iframeCount
                      ? mergeRenderedIframes(rawHtml, chosenHtml)
                      : rawHtml;
                  }
                }
              }
            } catch {
              // Raw-fetch comparison is best-effort; keep the rendered HTML.
            }

            content = Buffer.from(chosenHtml, "utf-8");
            contentType = "text/html";

            // Queue any extra assets discovered by the mobile-viewport pass
            // (responsive / mobile-only images, media-query backgrounds, etc.)
            // so the offline copy looks right at any screen size.
            if (rendered.extraAssetUrls?.length) {
              for (const extra of rendered.extraAssetUrls) {
                const normalized = normalizeUrl(extra, currentUrl);
                if (normalized && !discoveredUrls.has(normalized)) {
                  discoveredUrls.add(normalized);
                  urlQueue.push({ url: normalized, referrer: currentUrl });
                }
              }
            }
          } catch (renderErr: any) {
            // Cloudflare bot challenge can't be cleared by a plain fetch either —
            // re-throw so the user sees the friendly "site is protected" message.
            if (/Cloudflare/i.test(renderErr?.message ?? "")) {
              throw renderErr;
            }
            console.log(`Puppeteer render failed for ${currentUrl}, falling back to fetch: ${renderErr.message}`);
            const fetched = await fetchBytesWithTimeout(downloadUrl);
            contentType = fetched.contentType;
            content = fetched.content;
          }
        } else {
          // Static site — plain fetch is all we need (no JS rendering, no lazy loads).
          const fetched = await fetchBytesWithTimeout(downloadUrl);
          contentType = fetched.contentType;
          content = fetched.content;
        }
      } else {
        // Use downloadUrl (may differ from currentUrl for normalised Wix CDN images)
        const fetched = await fetchBytesWithTimeout(downloadUrl);
        contentType = fetched.contentType;

        if (assetType === "html") {
          const feedContentTypes = ["application/rss+xml", "application/atom+xml", "text/xml", "application/xml"];
          if (feedContentTypes.some(ct => contentType.includes(ct))) {
            asset = (await storage.updateAsset(jobId, asset.id, {
              status: "skipped",
              error: "RSS/XML feed content (not HTML)",
            }))!;
            assetMap.set(currentUrl, asset);
            continue;
          }
        }

        content = fetched.content;
      }
      
      // Save file
      const filePath = path.join(outputDir, localPath);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content);
      
      // Update asset status
      asset = (await storage.updateAsset(jobId, asset.id, {
        status: "success",
        size: content.length,
      }))!;
      assetMap.set(currentUrl, asset);
      if (downloadUrl !== currentUrl) {
        assetMap.set(downloadUrl, asset);
        wixBaseDownloaded.set(downloadUrl, asset);
      }
      
      // Parse HTML/CSS for more URLs (only for same-origin content or HTML)
      if (assetType === "html" && contentType.includes("text/html")) {
        htmlPagesProcessed++;
        
        // Skip further HTML link discovery if we've hit the page limit
        if (htmlPagesProcessed > MAX_HTML_PAGES) {
          onProgress({
            jobId,
            status: "scraping",
            currentAsset: asset,
            totalAssets: assetMap.size,
            processedAssets: Array.from(assetMap.values()).filter(
              a => a.status === "success" || a.status === "failed" || a.status === "skipped"
            ).length,
            successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
            failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
            message: `Page limit reached (${MAX_HTML_PAGES}). Downloading remaining assets...`,
          }, asset);
          continue;
        }
        
        const html = content.toString("utf-8");
        const $ = cheerio.load(html);
        
        // Extract URLs from various sources
        const selectors = [
          { sel: "a[href]", attr: "href" },
          { sel: "link[href]", attr: "href" },
          { sel: "script[src]", attr: "src" },
          { sel: "img[src]", attr: "src" },
          { sel: "img[data-src]", attr: "data-src" },
          { sel: "img[data-image]", attr: "data-image" },
          { sel: "img[srcset]", attr: "srcset" },
          { sel: "img[data-srcset]", attr: "data-srcset" },
          { sel: "[data-background-image]", attr: "data-background-image" },
          { sel: "[data-background]", attr: "data-background" },
          { sel: "[data-image-url]", attr: "data-image-url" },
          { sel: "[data-poster]", attr: "data-poster" },
          { sel: "source[src]", attr: "src" },
          { sel: "source[srcset]", attr: "srcset" },
          { sel: "video[src]", attr: "src" },
          { sel: "video[poster]", attr: "poster" },
          { sel: "audio[src]", attr: "src" },
          { sel: "[style]", attr: "style" },
          { sel: "meta[content]", attr: "content" },
        ];
        
        // Also extract images from noscript tags
        $("noscript").each((_, el) => {
          const noscriptHtml = $(el).html();
          if (noscriptHtml) {
            const $noscript = cheerio.load(noscriptHtml);
            $noscript("img[src]").each((_, img) => {
              const src = $noscript(img).attr("src");
              if (src) {
                const normalized = normalizeUrl(src, currentUrl);
                if (normalized && !discoveredUrls.has(normalized)) {
                  discoveredUrls.add(normalized);
                  urlQueue.push({ url: normalized, referrer: currentUrl });
                }
              }
            });
          }
        });
        
        for (const { sel, attr } of selectors) {
          $(sel).each((_, el) => {
            const value = $(el).attr(attr);
            if (!value) return;
            
            // Handle srcset
            if (attr === "srcset") {
              parseSrcset(value).forEach(entry => {
                const normalized = normalizeUrl(entry.url, currentUrl);
                if (normalized && !discoveredUrls.has(normalized)) {
                  discoveredUrls.add(normalized);
                  const type = getAssetType(normalized);
                  if (type !== "html" || !isExternalUrl(normalized, baseHost)) {
                    urlQueue.push({ url: normalized, referrer: currentUrl });
                  }
                }
              });
              return;
            }
            
            // Handle inline styles for background images
            if (attr === "style") {
              const urlMatches = value.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
              if (urlMatches) {
                urlMatches.forEach(match => {
                  const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/);
                  if (urlMatch && urlMatch[1]) {
                    const normalized = normalizeUrl(urlMatch[1], currentUrl);
                    if (normalized && !discoveredUrls.has(normalized)) {
                      discoveredUrls.add(normalized);
                      urlQueue.push({ url: normalized, referrer: currentUrl });
                    }
                  }
                });
              }
              return;
            }
            
            // Handle og:image and similar meta tags
            if (attr === "content" && sel === "meta[content]") {
              const property = $(el).attr("property") || $(el).attr("name") || "";
              // Only extract actual image URLs from og:image, not dimension/type meta tags
              const validImageProps = ["og:image", "twitter:image", "image"];
              const isImageProp = validImageProps.some(p => property === p || property === `${p}:url`);
              if (!isImageProp) return;
              // Skip values that don't look like URLs (e.g., og:image:width = "1500")
              if (!value.startsWith("http") && !value.startsWith("//") && !value.startsWith("/")) return;
            }
            
            const normalized = normalizeUrl(value, currentUrl);
            if (normalized) {
              const type = getAssetType(normalized);
              const isSameDomainHtml = type === "html" && !isExternalUrl(normalized, baseHost);
              // For same-domain HTML pages, deduplicate by pathname only so that
              // query-string variants (?itemId=..., ?sort=...) don't each generate
              // a separate HTML file and waste the asset budget.
              let dedupeKey = normalized;
              let queueUrl = normalized;
              if (isSameDomainHtml) {
                try {
                  const p = new URL(normalized);
                  dedupeKey = `${p.origin}${p.pathname}`;
                  queueUrl = dedupeKey;
                } catch {}
              }
              if (!discoveredUrls.has(dedupeKey)) {
                discoveredUrls.add(dedupeKey);
                if (type !== "html" || !isExternalUrl(normalized, baseHost)) {
                  urlQueue.push({ url: queueUrl, referrer: currentUrl });
                }
              }
            }
          });
        }
        
        // Wix-specific: extract images from data-image-info JSON attributes
        $("[data-image-info]").each((_, el) => {
          try {
            const info = JSON.parse($(el).attr("data-image-info") || "{}");
            if (info.uri) {
              const cdnUrl = `https://static.wixstatic.com/media/${info.uri}`;
              if (!discoveredUrls.has(cdnUrl)) {
                discoveredUrls.add(cdnUrl);
                urlQueue.push({ url: cdnUrl, referrer: currentUrl });
              }
            }
          } catch {}
        });

        // Wix-specific: resolve wix:image:// URIs in src / data-src to real CDN URLs
        $("img[src^='wix:image://'], img[data-src^='wix:image://']").each((_, el) => {
          for (const attr of ["src", "data-src"] as const) {
            const wixUri = $(el).attr(attr);
            if (wixUri?.startsWith("wix:image://")) {
              const cdnUrl = resolveWixUri(wixUri);
              if (cdnUrl && !discoveredUrls.has(cdnUrl)) {
                discoveredUrls.add(cdnUrl);
                urlQueue.push({ url: cdnUrl, referrer: currentUrl });
              }
            }
          }
        });

        // Extract URLs from inline styles in <style> tags
        $("style").each((_, el) => {
          const cssContent = $(el).html();
          if (cssContent) {
            extractUrlsFromCss(cssContent, currentUrl).forEach(cssUrl => {
              if (!discoveredUrls.has(cssUrl)) {
                discoveredUrls.add(cssUrl);
                urlQueue.push({ url: cssUrl, referrer: currentUrl });
              }
            });
          }
        });
      }
      
      // Parse CSS for URLs
      if (assetType === "css" || contentType.includes("text/css")) {
        const cssContent = content.toString("utf-8");
        extractUrlsFromCss(cssContent, currentUrl).forEach(cssUrl => {
          if (!discoveredUrls.has(cssUrl)) {
            discoveredUrls.add(cssUrl);
            urlQueue.push({ url: cssUrl, referrer: currentUrl });
          }
        });
      }
      
      onProgress({
        jobId,
        status: "scraping",
        currentAsset: asset,
        totalAssets: assetMap.size,
        processedAssets: Array.from(assetMap.values()).filter(
          a => a.status === "success" || a.status === "failed" || a.status === "skipped"
        ).length,
        successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
        failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
        message: `Downloaded: ${localPath}`,
      }, asset);
      
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Translate low-level connection errors into a user-readable message.
      if (isConnectError(error, getHostBreaker(currentUrl)) || errorMessage === "fetch failed") {
        errorMessage = "Could not connect to the site (connection timed out or refused)";
      }

      // Cloudflare bot challenge on the entry page → fail the whole job with a
      // friendly message instead of silently returning an empty ZIP.
      if (currentUrl === url && /Cloudflare/i.test(errorMessage)) {
        throw error;
      }

      // Entry page itself unreachable → nothing to back up; fail the whole job
      // with a clear message instead of "completing" with an empty ZIP.
      if (currentUrl === url) {
        throw new Error(
          getHostBreaker(url)?.sawConnectFailure
            ? HOST_BLOCKED_MESSAGE
            : `Could not load the site's first page: ${errorMessage}`
        );
      }

      asset = (await storage.updateAsset(jobId, asset.id, {
        status: "failed",
        error: errorMessage,
      }))!;
      assetMap.set(currentUrl, asset);
      
      onProgress({
        jobId,
        status: "scraping",
        currentAsset: asset,
        totalAssets: assetMap.size,
        processedAssets: Array.from(assetMap.values()).filter(
          a => a.status === "success" || a.status === "failed" || a.status === "skipped"
        ).length,
        successfulAssets: Array.from(assetMap.values()).filter(a => a.status === "success").length,
        failedAssets: Array.from(assetMap.values()).filter(a => a.status === "failed").length,
        message: `Failed: ${currentUrl}`,
      }, asset);
    }
    
    // Small delay to avoid overwhelming servers
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
  }
  
  // Transform HTML for offline viewing (handle lazy loading, noscript, etc.)
  await transformForOffline(outputDir);
  
  // Rewrite URLs in HTML and CSS files
  await closeBrowser();
  
  await rewriteUrls(outputDir, url, assetMap);
  
  // Generate failure log for failed/skipped assets
  await generateFailureLog(outputDir, assetMap, url);
  
  // Create ZIP archive
  const zipPath = `/tmp/scrape-${jobId}.zip`;
  await createZipArchive(outputDir, zipPath);
  
  return zipPath;
}

async function generateFailureLog(outputDir: string, assetMap: Map<string, Asset>, baseUrl: string): Promise<void> {
  const failedAssets = Array.from(assetMap.values()).filter(a => a.status === "failed");
  const skippedAssets = Array.from(assetMap.values()).filter(a => a.status === "skipped");
  
  if (failedAssets.length === 0 && skippedAssets.length === 0) {
    return; // No failures to log
  }
  
  const lines: string[] = [];
  lines.push("=" .repeat(80));
  lines.push("WEBSUCKER SCRAPE REPORT - MISSING/FAILED ASSETS");
  lines.push("=" .repeat(80));
  lines.push(`Source URL: ${baseUrl}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  
  if (failedAssets.length > 0) {
    lines.push("-".repeat(80));
    lines.push(`FAILED ASSETS (${failedAssets.length})`);
    lines.push("-".repeat(80));
    lines.push("These assets could not be downloaded. You may need to obtain them from the client.");
    lines.push("");
    
    for (const asset of failedAssets) {
      lines.push(`URL: ${asset.originalUrl}`);
      lines.push(`  Type: ${asset.type}`);
      lines.push(`  Error: ${asset.error || "Unknown error"}`);
      if (asset.referencedFrom) {
        lines.push(`  Referenced from: ${asset.referencedFrom}`);
      }
      lines.push("");
    }
  }
  
  if (skippedAssets.length > 0) {
    lines.push("-".repeat(80));
    lines.push(`SKIPPED ASSETS (${skippedAssets.length})`);
    lines.push("-".repeat(80));
    lines.push("These assets were intentionally skipped (e.g., analytics, third-party tracking).");
    lines.push("");
    
    for (const asset of skippedAssets) {
      lines.push(`URL: ${asset.originalUrl}`);
      lines.push(`  Type: ${asset.type}`);
      lines.push(`  Reason: ${asset.error || "Third-party/external resource"}`);
      if (asset.referencedFrom) {
        lines.push(`  Referenced from: ${asset.referencedFrom}`);
      }
      lines.push("");
    }
  }
  
  lines.push("=".repeat(80));
  lines.push("END OF REPORT");
  lines.push("=".repeat(80));
  
  const logPath = path.join(outputDir, "_MISSING_ASSETS_LOG.txt");
  await fs.promises.writeFile(logPath, lines.join("\n"), "utf-8");
}

async function createPlaceholderImage(outputDir: string): Promise<string> {
  const placeholderPath = path.join(outputDir, "_placeholder.svg");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f0f0f0"/>
  <rect x="10" y="10" width="380" height="280" fill="#e0e0e0" rx="8"/>
  <text x="200" y="140" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#888">
    Image Not Available
  </text>
  <text x="200" y="165" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#aaa">
    (External resource)
  </text>
  <path d="M175 100 L200 80 L225 100 L215 100 L215 120 L185 120 L185 100 Z" fill="#ccc"/>
  <circle cx="200" cy="70" r="8" fill="#ccc"/>
</svg>`;
  await fs.promises.writeFile(placeholderPath, svg, "utf-8");
  return "_placeholder.svg";
}

function extractUrlsFromCss(css: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
  let match;
  
  while ((match = urlRegex.exec(css)) !== null) {
    // Skip fragment-only references (e.g., url(#check)) - these are SVG/inline references
    if (match[1].startsWith("#") || match[1].startsWith("%23")) continue;
    const normalized = normalizeUrl(match[1], baseUrl);
    if (normalized) {
      urls.push(normalized);
    }
  }
  
  // Also look for @import statements
  const importRegex = /@import\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(css)) !== null) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (normalized) {
      urls.push(normalized);
    }
  }
  
  return urls;
}

// Transform HTML for offline viewing - handle lazy loading, noscript, and CMS patterns
async function transformForOffline(outputDir: string): Promise<void> {
  const htmlFiles = await findFiles(outputDir, [".html", ".htm"]);
  
  for (const file of htmlFiles) {
    const content = await fs.promises.readFile(file, "utf-8");
    const $ = cheerio.load(content);
    let modified = false;
    
    // 1. Convert lazy-loaded images: copy data-src/data-image to src
    $("img[data-src]").each((_, el) => {
      const dataSrc = $(el).attr("data-src");
      const currentSrc = $(el).attr("src");
      // Only set src if it's empty, a placeholder, or data URI
      if (dataSrc && (!currentSrc || currentSrc.startsWith("data:") || currentSrc.includes("placeholder") || currentSrc.includes("spacer"))) {
        $(el).attr("src", dataSrc);
        modified = true;
      }
    });
    
    $("img[data-image]").each((_, el) => {
      const dataImage = $(el).attr("data-image");
      const currentSrc = $(el).attr("src");
      if (dataImage && (!currentSrc || currentSrc.startsWith("data:") || currentSrc.includes("placeholder"))) {
        $(el).attr("src", dataImage);
        modified = true;
      }
    });
    
    // 2. Handle background images in data attributes
    $("[data-background-image]").each((_, el) => {
      const bgImage = $(el).attr("data-background-image");
      if (bgImage) {
        const currentStyle = $(el).attr("style") || "";
        if (!currentStyle.includes("background-image")) {
          $(el).attr("style", `${currentStyle}; background-image: url('${bgImage}');`);
          modified = true;
        }
      }
    });
    
    // 3. Extract images from ALL noscript tags — offline mode has no JS so noscript content is the only fallback
    $("noscript").each((_, el) => {
      const noscriptHtml = $(el).html();
      if (!noscriptHtml || !noscriptHtml.includes("<img")) return;
      const $noscript = cheerio.load(noscriptHtml);
      const parent = $(el).parent();

      // Try to patch a nearby lazy img first (same parent has data-src img)
      const lazyImg = parent.find("img[data-src], img[data-image], img:not([src])").first();
      const noscriptImgs = $noscript("img").toArray();

      if (lazyImg.length && noscriptImgs.length) {
        const noscriptImg = $noscript(noscriptImgs[0]);
        const noscriptSrc = noscriptImg.attr("src");
        const noscriptSrcset = noscriptImg.attr("srcset");
        if (noscriptSrc && (!lazyImg.attr("src") || lazyImg.attr("src")?.startsWith("data:"))) {
          lazyImg.attr("src", noscriptSrc);
          modified = true;
        }
        if (noscriptSrcset && !lazyImg.attr("srcset")) {
          lazyImg.attr("srcset", noscriptSrcset);
          modified = true;
        }
      } else {
        // No lazy img nearby — replace the noscript element itself with its img content
        const noscriptImg = $noscript("img").first();
        const src = noscriptImg.attr("src");
        if (src) {
          const attrs = (noscriptImg[0] as any).attribs || {};
          const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ");
          $(el).replaceWith(`<img ${attrStr}>`);
          modified = true;
        }
      }
    });
    
    // 4. Handle Squarespace-specific: data-src on divs with content-fill class
    $(".content-fill img[data-src], .sqs-image img[data-src]").each((_, el) => {
      const dataSrc = $(el).attr("data-src");
      if (dataSrc && !$(el).attr("src")) {
        $(el).attr("src", dataSrc);
        modified = true;
      }
    });
    
    // 5. Remove data-load="false" which prevents images from loading
    $("img[data-load='false']").each((_, el) => {
      $(el).removeAttr("data-load");
      modified = true;
    });
    
    // 5b. Remove loading="lazy" — offline browsers won't trigger lazy loads without scroll events
    $("img[loading='lazy'], iframe[loading='lazy']").each((_, el) => {
      $(el).attr("loading", "eager");
      modified = true;
    });
    
    // 6. Handle srcset that might be in data-srcset
    $("img[data-srcset]").each((_, el) => {
      const dataSrcset = $(el).attr("data-srcset");
      if (dataSrcset && !$(el).attr("srcset")) {
        $(el).attr("srcset", dataSrcset);
        modified = true;
      }
    });
    
    // 6b. Wix-specific: convert wix:image:// URIs remaining in src/data-src to real CDN URLs
    $("img[src^='wix:image://']").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const cdnUrl = resolveWixUri(src);
        if (cdnUrl) { $(el).attr("src", cdnUrl); modified = true; }
      }
    });
    $("img[data-src^='wix:image://']").each((_, el) => {
      const dataSrc = $(el).attr("data-src");
      if (dataSrc) {
        const cdnUrl = resolveWixUri(dataSrc);
        if (cdnUrl) { $(el).attr("data-src", cdnUrl); $(el).attr("src", cdnUrl); modified = true; }
      }
    });

    // 6c. Wix-specific: populate src from data-image-info JSON when src is missing
    $("[data-image-info]").each((_, el) => {
      const currentSrc = $(el).attr("src");
      if (!currentSrc || currentSrc.startsWith("data:") || currentSrc.startsWith("wix:")) {
        try {
          const info = JSON.parse($(el).attr("data-image-info") || "{}");
          if (info.uri) {
            $(el).attr("src", `https://static.wixstatic.com/media/${info.uri}`);
            modified = true;
          }
        } catch {}
      }
    });

    // 7. Handle dropdown menus - make them work without JS
    $("[data-folder], .header-nav-folder-content, .header-nav-item--folder").each((_, el) => {
      // Remove any hidden/invisible states
      $(el).removeClass("header-nav-folder-content--hidden");
      $(el).css("visibility", "visible");
      modified = true;
    });
    
    // 8. Remove loading/skeleton states
    $(".loading, .skeleton, [data-loading]").each((_, el) => {
      $(el).removeClass("loading skeleton");
      $(el).removeAttr("data-loading");
      modified = true;
    });
    
    // 9. Force text/content visibility
    $("[data-animation-role]").each((_, el) => {
      $(el).addClass("animation-loaded");
      modified = true;
    });
    
    // 10. Preserve and activate embeds
    // Handle lazy-loaded iframes (data-src pattern)
    $("iframe[data-src]").each((_, el) => {
      const dataSrc = $(el).attr("data-src");
      const currentSrc = $(el).attr("src");
      if (dataSrc && (!currentSrc || currentSrc === "about:blank" || currentSrc.startsWith("data:"))) {
        $(el).attr("src", dataSrc);
        modified = true;
      }
    });
    
    // Handle Squarespace video blocks with data-html
    $(".sqs-block-video .video-player[data-html], .sqs-video-wrapper[data-html]").each((_, el) => {
      const dataHtml = $(el).attr("data-html");
      if (dataHtml) {
        try {
          const decoded = dataHtml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
          if (decoded.includes("<iframe")) {
            $(el).html(decoded);
            modified = true;
          }
        } catch {}
      }
    });
    
    // Handle Squarespace embed blocks with data-html
    $(".sqs-block-embed [data-html], .sqs-block-code [data-html], .embed-block [data-html]").each((_, el) => {
      const dataHtml = $(el).attr("data-html");
      if (dataHtml) {
        try {
          const decoded = dataHtml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
          $(el).html(decoded);
          modified = true;
        } catch {}
      }
    });
    
    // Ensure all iframes are visible
    $("iframe").each((_, el) => {
      const style = $(el).attr("style") || "";
      if (style.includes("display: none") || style.includes("display:none")) {
        $(el).attr("style", style.replace(/display:\s*none/g, "display: block"));
        modified = true;
      }
    });
    
    // Handle data-video-url attributes (common in many CMS platforms)
    $("[data-video-url]").each((_, el) => {
      const videoUrl = $(el).attr("data-video-url");
      if (videoUrl && !$(el).find("iframe").length) {
        const embedUrl = convertToEmbedUrl(videoUrl);
        if (embedUrl) {
          $(el).html(`<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`);
          modified = true;
        }
      }
    });
    
    // 11. Convert Wix <wix-iframe> custom elements to standard <iframe> elements
    $("wix-iframe[data-src]").each((_, el) => {
      const dataSrc = $(el).attr("data-src");
      const title = $(el).attr("title") || $(el).attr("aria-label") || "";
      const id = $(el).attr("id") || "";
      const className = $(el).attr("className") || $(el).attr("class") || "";
      if (dataSrc) {
        const iframe = $(`<iframe src="${dataSrc}" title="${title}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`);
        if (id) iframe.attr("id", id);
        if (className) iframe.attr("class", className);
        const style = $(el).attr("style");
        if (style) iframe.attr("style", style);
        $(el).replaceWith(iframe);
        modified = true;
      }
    });
    
    // 12. Convert Wix data-anchor scroll links to proper #anchor hash links
    $("a[data-anchor]").each((_, el) => {
      const anchor = $(el).attr("data-anchor");
      const href = $(el).attr("href") || "";
      if (anchor && anchor !== "SCROLL_TO_TOP") {
        const anchorCompId = $(el).attr("data-anchor-comp-id");
        const targetId = anchorCompId || anchor;
        $(el).attr("href", `#${targetId}`);
        modified = true;
      } else if (anchor === "SCROLL_TO_TOP") {
        $(el).attr("href", "#");
        modified = true;
      }
    });
    
    // Always add conservative offline CSS fixes (minimal changes to avoid breaking layout)
    const offlineCss = `
      <style id="offline-fixes">
        /* Lazy-loaded images */
        img[data-src], img[data-image] { opacity: 1 !important; }
        .lazyload, .lazyloading { opacity: 1 !important; }
        .offline-fallback-img { display: block !important; }
        
        /* Animation classes that hide content until JS runs */
        [data-animation-role].animation-loaded { opacity: 1 !important; }
        .preFade.animation-loaded, .preSlide.animation-loaded { 
          opacity: 1 !important; 
          transform: none !important; 
        }
        
        /* Squarespace images */
        .sqs-image img, .content-fill img { opacity: 1 !important; }
        .fluid-image-container img { opacity: 1 !important; }
        
        /* Embeds */
        iframe { max-width: 100% !important; }
        .sqs-block-video, .sqs-block-embed, .embed-block { overflow: visible !important; }
        .video-player iframe, .sqs-video-wrapper iframe { display: block !important; opacity: 1 !important; }
        
        /* Smooth scrolling for anchor links */
        html { scroll-behavior: smooth; }
        
        /* Wix hidden-during-prewarmup elements */
        .hidden-during-prewarmup { opacity: 1 !important; visibility: visible !important; }
      </style>
    `;
    $("head").append(offlineCss);
    
    const scrollScript = `
      <script id="offline-scroll">
        document.addEventListener('click', function(e) {
          var link = e.target.closest('a[href^="#"]');
          if (!link) return;
          var id = link.getAttribute('href').slice(1);
          if (!id) { window.scrollTo({top:0,behavior:'smooth'}); e.preventDefault(); return; }
          var target = document.getElementById(id) || document.querySelector('[data-anchor="'+id+'"]');
          if (target) { target.scrollIntoView({behavior:'smooth'}); e.preventDefault(); }
        });
      </script>
    `;
    $("body").append(scrollScript);

    // Offline gallery lightbox: JS-driven galleries (Wix pro-gallery etc.) rely
    // on runtime CDN chunks + API calls that can't run from an offline copy, so
    // clicking a gallery image does nothing. Inject a tiny self-contained
    // lightbox so gallery images stay clickable offline (zoom + prev/next).
    if ($('[id*="gallery" i] img, [class*="gallery" i] img, [data-hook*="gallery" i] img').length > 0) {
      const lightboxScript = `
      <script id="offline-lightbox">
        (function(){
          var imgs = Array.prototype.slice.call(document.querySelectorAll('[id*="gallery" i] img, [class*="gallery" i] img, [data-hook*="gallery" i] img'));
          imgs = imgs.filter(function(im, i){ return imgs.indexOf(im) === i && (im.naturalWidth === 0 || im.naturalWidth > 60); });
          if (!imgs.length) return;
          var overlay, big, counter, idx = 0;
          function btn(t, css){ var b = document.createElement('button'); b.textContent = t;
            b.style.cssText = 'position:absolute;color:#fff;background:rgba(0,0,0,.35);border:none;cursor:pointer;font-size:34px;line-height:1;padding:8px 16px;border-radius:6px;' + css; return b; }
          function ensure(){ if (overlay) return;
            overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.93);display:none;z-index:2147483647;align-items:center;justify-content:center;cursor:zoom-out;';
            big = document.createElement('img');
            big.style.cssText = 'max-width:92vw;max-height:90vh;object-fit:contain;cursor:default;';
            big.addEventListener('click', function(e){ e.stopPropagation(); });
            counter = document.createElement('div');
            counter.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);color:#ccc;font:14px/1 sans-serif;';
            var prev = btn('\\u2039', 'left:12px;top:50%;transform:translateY(-50%);');
            var next = btn('\\u203a', 'right:12px;top:50%;transform:translateY(-50%);');
            var close = btn('\\u00d7', 'right:12px;top:12px;');
            prev.onclick = function(e){ e.stopPropagation(); show(idx - 1); };
            next.onclick = function(e){ e.stopPropagation(); show(idx + 1); };
            close.onclick = function(e){ e.stopPropagation(); hide(); };
            overlay.appendChild(big); overlay.appendChild(prev); overlay.appendChild(next); overlay.appendChild(close); overlay.appendChild(counter);
            overlay.addEventListener('click', hide);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', function(e){
              if (!overlay || overlay.style.display === 'none') return;
              if (e.key === 'Escape') hide();
              else if (e.key === 'ArrowLeft') show(idx - 1);
              else if (e.key === 'ArrowRight') show(idx + 1);
            });
          }
          function srcOf(im){ return im.currentSrc || im.src; }
          function show(i){ ensure(); idx = (i + imgs.length) % imgs.length; big.src = srcOf(imgs[idx]);
            counter.textContent = (idx + 1) + ' / ' + imgs.length; overlay.style.display = 'flex'; }
          function hide(){ if (overlay) overlay.style.display = 'none'; }
          imgs.forEach(function(im){ im.style.cursor = 'zoom-in'; });
          // Delegated capture-phase handler with coordinate hit-testing:
          // gallery items usually have an overlay <a> ON TOP of the <img>, so
          // per-image listeners never fire — the img is not in the event path.
          document.addEventListener('click', function(e){
            if (overlay && overlay.style.display === 'flex') return;
            var inGallery = e.target && e.target.closest && e.target.closest('[id*="gallery" i], [class*="gallery" i], [data-hook*="gallery" i]');
            if (!inGallery) return;
            for (var i = 0; i < imgs.length; i++) {
              var r = imgs[i].getBoundingClientRect();
              if (r.width > 30 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                e.preventDefault(); e.stopPropagation(); show(i); return;
              }
            }
          }, true);
        })();
      </script>
      `;
      $("body").append(lightboxScript);
      modified = true;
    }

    await fs.promises.writeFile(file, $.html());
  }
}

async function rewriteUrls(outputDir: string, baseUrl: string, assetMap: Map<string, Asset>): Promise<void> {
  const htmlFiles = await findFiles(outputDir, [".html", ".htm"]);
  const cssFiles = await findFiles(outputDir, [".css"]);
  const baseParsed = new URL(baseUrl);
  
  // Create placeholder image for missing assets
  const placeholderPath = await createPlaceholderImage(outputDir);
  
  // Image-related attributes that should use placeholder when missing
  const imageAttributes = new Set(["src", "data-src", "data-image", "srcset", "data-srcset", "poster", "data-background-image", "data-background", "data-image-url", "data-poster"]);
  
  // Build URL lookup map for efficient matching
  const urlLookup = new Map<string, string>();
  for (const [originalUrl, asset] of Array.from(assetMap.entries())) {
    if (asset.status !== "success") continue;
    // Store full URL and protocol-relative version
    urlLookup.set(originalUrl, asset.localPath);
    urlLookup.set(originalUrl.replace(/^https?:/, ""), asset.localPath);
    
    try {
      const parsed = new URL(originalUrl);
      // Map pathname for same-origin assets
      if (parsed.hostname === baseParsed.hostname) {
        const pathname = parsed.pathname;
        if (pathname.length > 1) {
          urlLookup.set(pathname, asset.localPath);
        }
      }
      // Also store URL without query string for matching
      const urlWithoutQuery = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      urlLookup.set(urlWithoutQuery, asset.localPath);
      urlLookup.set(urlWithoutQuery.replace(/^https?:/, ""), asset.localPath);
    } catch {}
  }

  // Wix-specific: build a hash-keyed fallback so ANY transformation variant of a
  // downloaded Wix image resolves to the local file we actually downloaded.
  // Wix CDN URL pattern: static.wixstatic.com/media/{HASH}/v1/{mode}/{params}/{filename}
  // Different resize variants share the same HASH, so we index by hash.
  const wixHashMap = new Map<string, string>(); // HASH -> localPath
  for (const [url, localPath] of urlLookup.entries()) {
    const hash = extractWixMediaHash(url);
    if (hash && !wixHashMap.has(hash)) {
      wixHashMap.set(hash, localPath);
    }
  }
  
  // Helper to resolve and lookup a URL
  const lookupUrl = (url: string, currentFileUrl?: string): string | undefined => {
    // Direct lookup first
    let result = urlLookup.get(url);
    if (result) return result;
    
    // Try without query/fragment
    const urlBase = url.split(/[#?]/)[0];
    result = urlLookup.get(urlBase);
    if (result) return result;
    
    // Try resolving relative URLs against the current page URL first, then base URL
    const resolveContexts = currentFileUrl ? [currentFileUrl, baseUrl] : [baseUrl];
    for (const context of resolveContexts) {
      try {
        const resolved = new URL(url, context).href;
        result = urlLookup.get(resolved);
        if (result) return result;
        
        // Try protocol-relative
        result = urlLookup.get(resolved.replace(/^https?:/, ""));
        if (result) return result;
        
        // Try without query string
        const parsed = new URL(resolved);
        const withoutQuery = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        result = urlLookup.get(withoutQuery);
        if (result) return result;
      } catch {}
    }

    // Wix CDN fallback: match by media hash, ignoring transformation params.
    // This handles srcset entries / alternative sizes we didn't specifically download.
    const wixHash = extractWixMediaHash(url);
    if (wixHash) {
      result = wixHashMap.get(wixHash);
      if (result) return result;
    }
    
    return undefined;
  };
  
  // Helper to check if a URL should be rewritten (skip mailto, tel, javascript, data URIs)
  const shouldRewrite = (url: string): boolean => {
    if (!url) return false;
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:") || 
        trimmed.startsWith("javascript:") || trimmed.startsWith("data:") ||
        trimmed.startsWith("#")) {
      return false;
    }
    return true;
  };
  
  // Build reverse map: local path -> original URL for resolving relative links
  const localPathToUrl = new Map<string, string>();
  for (const [originalUrl, asset] of Array.from(assetMap.entries())) {
    if (asset.status === "success") {
      localPathToUrl.set(asset.localPath, originalUrl);
    }
  }
  
  // Rewrite HTML files using Cheerio for safe DOM manipulation
  for (const file of htmlFiles) {
    const content = await fs.promises.readFile(file, "utf-8");
    const $ = cheerio.load(content);
    // Get the file's directory relative to outputDir for correct path calculation
    const relativeFilePath = path.relative(outputDir, file);
    const fileDir = path.dirname(relativeFilePath) || ".";
    // Determine the original URL for this file to resolve relative links correctly
    const currentFileOriginalUrl = localPathToUrl.get(relativeFilePath);
    let modified = false;
    
    // Known URL-bearing attributes
    const urlAttributes = [
      { sel: "[href]", attr: "href" },
      { sel: "[src]", attr: "src" },
      { sel: "[data-src]", attr: "data-src" },
      { sel: "[data-image]", attr: "data-image" },
      { sel: "[data-srcset]", attr: "data-srcset" },
      { sel: "[data-background-image]", attr: "data-background-image" },
      { sel: "[data-background]", attr: "data-background" },
      { sel: "[data-image-url]", attr: "data-image-url" },
      { sel: "[data-poster]", attr: "data-poster" },
      { sel: "[poster]", attr: "poster" },
      { sel: "[srcset]", attr: "srcset" },
    ];
    
    for (const { sel, attr } of urlAttributes) {
      $(sel).each((_, el) => {
        const value = $(el).attr(attr);
        if (!value || !shouldRewrite(value)) return;
        
        // Preserve external embeds (iframes, embed, object pointing to embed providers)
        const tagName = (el as any).tagName?.toLowerCase() || "";
        const isEmbedElement = tagName === "iframe" || tagName === "embed" || tagName === "object";
        if (isEmbedElement && (attr === "src" || attr === "data-src") && isExternalUrl(value, baseParsed.hostname)) {
          return;
        }
        
        // Check if this is an external URL that might need a placeholder
        const isExternalValue = value.startsWith("http") || value.startsWith("//");
        const isImageAttr = imageAttributes.has(attr);
        
        // Handle srcset specially (using proper parser to handle commas in URLs)
        if (attr === "srcset") {
          const entries = parseSrcset(value);
          const newSrcset = entries.map(entry => {
            if (!shouldRewrite(entry.url)) return entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url;
            const localPath = lookupUrl(entry.url, currentFileOriginalUrl);
            if (localPath) {
              const relativePath = path.relative(fileDir || ".", localPath);
              return entry.descriptor ? `${relativePath} ${entry.descriptor}` : relativePath;
            }
            // Use placeholder for missing external images
            if (entry.url.startsWith("http") || entry.url.startsWith("//")) {
              const relativePlaceholder = path.relative(fileDir || ".", placeholderPath);
              return entry.descriptor ? `${relativePlaceholder} ${entry.descriptor}` : relativePlaceholder;
            }
            return entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url;
          }).join(", ");
          if (newSrcset !== value) {
            $(el).attr(attr, newSrcset);
            modified = true;
          }
          return;
        }
        
        // Extract fragment suffix to preserve (only #anchors, not query strings)
        // Query strings are already handled by urlToLocalPath hashing into filename
        const hashIdx = value.indexOf('#');
        const suffix = hashIdx !== -1 ? value.slice(hashIdx) : "";
        
        let localPath = lookupUrl(value, currentFileOriginalUrl);
        
        // For internal href links not in asset map, compute expected local path
        if (!localPath && attr === "href" && !isExternalValue) {
          // Try resolving against the current page URL first, then baseUrl
          const resolveContexts = currentFileOriginalUrl ? [currentFileOriginalUrl, baseUrl] : [baseUrl];
          for (const context of resolveContexts) {
            try {
              const absoluteUrl = new URL(value, context).href;
              const expectedPath = urlToLocalPath(absoluteUrl, baseUrl);
              const fullPath = path.join(outputDir, expectedPath);
              if (fs.existsSync(fullPath)) {
                localPath = expectedPath;
                break;
              }
            } catch {}
          }
        }
        
        if (localPath) {
          const relativePath = path.relative(fileDir || ".", localPath);
          $(el).attr(attr, relativePath + suffix);
          modified = true;
        } else if (isImageAttr && !value.startsWith("#") && !value.startsWith("data:")) {
          // Use placeholder for all missing images (both external CDN images and internal images that failed to download)
          const relativePlaceholder = path.relative(fileDir || ".", placeholderPath);
          $(el).attr(attr, relativePlaceholder);
          modified = true;
        }
      });
    }
    
    // Handle inline styles with url()
    $("[style]").each((_, el) => {
      const style = $(el).attr("style");
      if (style && style.includes("url(")) {
        const newStyle = rewriteCssUrls(style, (u) => lookupUrl(u, currentFileOriginalUrl), fileDir);
        if (newStyle !== style) {
          $(el).attr("style", newStyle);
          modified = true;
        }
      }
    });
    
    // Handle <style> tags
    $("style").each((_, el) => {
      const css = $(el).html();
      if (css) {
        const newCss = rewriteCssUrls(css, (u) => lookupUrl(u, currentFileOriginalUrl), fileDir);
        if (newCss !== css) {
          $(el).html(newCss);
          modified = true;
        }
      }
    });
    
    // Process <noscript> elements — Cheerio can't select inside them so we rewrite
    // their raw HTML content separately using a nested parse.
    $("noscript").each((_, el) => {
      const rawInner = $(el).html();
      if (!rawInner) return;
      const $inner = cheerio.load(rawInner, {}, false);
      let innerModified = false;
      for (const { sel, attr } of urlAttributes) {
        $inner(sel).each((_, innerEl) => {
          const value = $inner(innerEl).attr(attr);
          if (!value || !shouldRewrite(value)) return;
          if (attr === "srcset") {
            const entries = parseSrcset(value);
            const newSrcset = entries.map(entry => {
              if (!shouldRewrite(entry.url)) return entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url;
              const lp = lookupUrl(entry.url, currentFileOriginalUrl);
              if (lp) {
                const rp = path.relative(fileDir || ".", lp);
                return entry.descriptor ? `${rp} ${entry.descriptor}` : rp;
              }
              if (entry.url.startsWith("http") || entry.url.startsWith("//")) {
                const rp = path.relative(fileDir || ".", placeholderPath);
                return entry.descriptor ? `${rp} ${entry.descriptor}` : rp;
              }
              return entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url;
            }).join(", ");
            if (newSrcset !== value) {
              $inner(innerEl).attr(attr, newSrcset);
              innerModified = true;
            }
            return;
          }
          const localPath = lookupUrl(value, currentFileOriginalUrl);
          if (localPath) {
            const relativePath = path.relative(fileDir || ".", localPath);
            $inner(innerEl).attr(attr, relativePath);
            innerModified = true;
          } else if (imageAttributes.has(attr) && !value.startsWith("#") && !value.startsWith("data:")) {
            const relativePlaceholder = path.relative(fileDir || ".", placeholderPath);
            $inner(innerEl).attr(attr, relativePlaceholder);
            innerModified = true;
          }
        });
      }
      if (innerModified) {
        const newInner = $inner.html() || rawInner;
        $(el).html(newInner);
        modified = true;
      }
    });
    
    if (modified) {
      await fs.promises.writeFile(file, $.html());
    }
  }
  
  // Rewrite CSS files
  for (const file of cssFiles) {
    const content = await fs.promises.readFile(file, "utf-8");
    // Get the file's directory relative to outputDir for correct path calculation
    const relativeFilePath = path.relative(outputDir, file);
    const fileDir = path.dirname(relativeFilePath) || ".";
    const cssFileOriginalUrl = localPathToUrl.get(relativeFilePath);
    const newContent = rewriteCssUrls(content, (u) => lookupUrl(u, cssFileOriginalUrl), fileDir);
    
    if (newContent !== content) {
      await fs.promises.writeFile(file, newContent);
    }
  }
}

function rewriteCssUrls(css: string, lookupUrl: (url: string) => string | undefined, fileDir: string): string {
  let result = css;
  
  // Replace url() patterns in CSS, preserving quotes
  result = result.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, (match, quote, url) => {
    // Skip data URIs
    if (url.startsWith("data:")) return match;
    
    const suffix = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    const localPath = lookupUrl(url);
    if (localPath) {
      const relativePath = path.relative(fileDir || ".", localPath);
      return `url(${quote}${relativePath}${suffix}${quote})`;
    }
    return match;
  });
  
  // Replace @import statements
  result = result.replace(/@import\s+(['"])([^'"]+)\1/g, (match, quote, url) => {
    // Skip data URIs
    if (url.startsWith("data:")) return match;
    
    const suffix = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    const localPath = lookupUrl(url);
    if (localPath) {
      const relativePath = path.relative(fileDir || ".", localPath);
      return `@import ${quote}${relativePath}${suffix}${quote}`;
    }
    return match;
  });
  
  // Replace @import url() statements
  result = result.replace(/@import\s+url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, (match, quote, url) => {
    // Skip data URIs
    if (url.startsWith("data:")) return match;
    
    const suffix = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    const localPath = lookupUrl(url);
    if (localPath) {
      const relativePath = path.relative(fileDir || ".", localPath);
      return `@import url(${quote}${relativePath}${suffix}${quote})`;
    }
    return match;
  });
  
  return result;
}

async function findFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...await findFiles(fullPath, extensions));
      } else if (extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }
  
  return files;
}

async function createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    
    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export async function cleanupScrapeFiles(jobId: string): Promise<void> {
  const outputDir = `/tmp/scrape-${jobId}`;
  const zipPath = `/tmp/scrape-${jobId}.zip`;
  
  try {
    await fs.promises.rm(outputDir, { recursive: true, force: true });
    await fs.promises.rm(zipPath, { force: true });
  } catch {
    // Ignore cleanup errors
  }
  // Clear per-job ScrapingBee budget tracker so the Map doesn't grow forever.
  resetScrapingBeeUsage(jobId);
}
