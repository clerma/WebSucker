import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import archiver from "archiver";
import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";
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
const MAX_ASSET_SIZE = 10 * 1024 * 1024; // 10MB per asset
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

// Fetch the full response body under a single unified timeout.
// The AbortController is kept alive until the body is fully read,
// so a slow/stalled body transfer is caught just like a slow connection.
async function fetchBytesWithTimeout(
  url: string,
  timeoutMs = 12000
): Promise<{ content: Buffer; contentType: string }> {
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
    return { content: Buffer.concat(chunks), contentType };
  } finally {
    clearTimeout(timeoutId);
  }
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
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
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

async function fetchRenderedHtml(url: string, timeout = 45000): Promise<{ html: string; status: number }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Use "load" instead of "networkidle2" — fires when load event fires rather than
    // waiting for ALL network requests to settle (which can take 10-30s on Wix/analytics-heavy sites).
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout,
    }).catch(async () => {
      // If load times out, try domcontentloaded as last resort
      return page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
    });
    
    const status = response?.status() || 200;
    
    if (status >= 400) {
      return { html: "", status };
    }
    
    // Short settle wait after load event
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Scroll the page to trigger lazy-loaded images and embeds
    await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 80);
      });
    });
    
    // Wait for lazy-loaded content to appear (reduced from 5s → 2s)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await page.evaluate(() => window.scrollTo(0, 0));
    
    // Brief network idle check
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 }).catch(() => {});
    
    const html = await page.content();
    return { html, status };
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
  
  const discoveredUrls = new Set<string>();
  const processedUrls = new Set<string>();
  const urlQueue: Array<{ url: string; referrer: string }> = [{ url, referrer: "Entry point" }];
  const assetMap = new Map<string, Asset>();
  let htmlPagesProcessed = 0;
  
  const outputDir = `/tmp/scrape-${jobId}`;
  await fs.promises.mkdir(outputDir, { recursive: true });

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
      
      if (assetType === "html" && !isExternal) {
        try {
          const rendered = await fetchRenderedHtml(currentUrl);
          
          if (rendered.status >= 400) {
            throw new Error(`HTTP ${rendered.status}`);
          }
          
          if (!rendered.html || rendered.html.length < 50) {
            throw new Error("Empty or invalid page content");
          }
          
          content = Buffer.from(rendered.html, "utf-8");
          contentType = "text/html";
        } catch (renderErr: any) {
          console.log(`Puppeteer render failed for ${currentUrl}, falling back to fetch: ${renderErr.message}`);
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
            if (normalized && !discoveredUrls.has(normalized)) {
              discoveredUrls.add(normalized);
              const type = getAssetType(normalized);
              // Only follow same-origin HTML links
              if (type !== "html" || !isExternalUrl(normalized, baseHost)) {
                urlQueue.push({ url: normalized, referrer: currentUrl });
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
}
