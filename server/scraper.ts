import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import archiver from "archiver";
import { storage } from "./storage";
import type { Asset, AssetType, AssetStatus, ScrapeProgress } from "@shared/schema";

type ProgressCallback = (progress: ScrapeProgress, asset?: Asset) => void;

interface ScrapeOptions {
  jobId: string;
  url: string;
  onProgress: ProgressCallback;
}

// Safety limits to prevent runaway crawling
const MAX_ASSETS = 500;
const MAX_HTML_PAGES = 50;
const MAX_ASSET_SIZE = 10 * 1024 * 1024; // 10MB per asset
const REQUEST_DELAY = 150; // ms between requests

const ALLOWED_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".json",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".xml", ".txt", ".pdf",
]);

const SKIP_DOMAINS = new Set([
  "google-analytics.com", "googletagmanager.com", "facebook.net",
  "twitter.com", "linkedin.com", "doubleclick.net", "googlesyndication.com",
  "facebook.com", "hotjar.com", "clarity.ms", "segment.com",
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

function getAssetType(url: string): AssetType {
  const pathname = new URL(url, "http://example.com").pathname.toLowerCase();
  const ext = path.extname(pathname);

  if ([".html", ".htm", ""].includes(ext)) return "html";
  if (ext === ".css") return "css";
  if ([".js", ".mjs"].includes(ext)) return "js";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"].includes(ext)) return "image";
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

function shouldSkipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SKIP_DOMAINS.has(parsed.hostname) || 
           Array.from(SKIP_DOMAINS).some(d => parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function urlToLocalPath(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    
    let localPath = parsed.pathname;
    
    // Handle external URLs - put them in _external folder
    if (parsed.hostname !== base.hostname) {
      localPath = `_external/${parsed.hostname}${parsed.pathname}`;
    }
    
    // Handle root path
    if (localPath === "/" || localPath === "") {
      localPath = "/index.html";
    }
    
    // Add index.html to directory paths
    if (!path.extname(localPath)) {
      localPath = localPath.endsWith("/") ? `${localPath}index.html` : `${localPath}/index.html`;
    }
    
    // Add hash of query string to avoid collisions for URLs with different params
    if (parsed.search) {
      const hash = crypto.createHash("md5").update(parsed.search).digest("hex").slice(0, 8);
      const ext = path.extname(localPath);
      const base = localPath.slice(0, -ext.length);
      localPath = `${base}_${hash}${ext}`;
    }
    
    // Remove leading slash
    return localPath.replace(/^\//, "");
  } catch {
    return "unknown.html";
  }
}

async function fetchWithTimeout(url: string, timeout = 15000): Promise<Response> {
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
  const urlQueue: string[] = [url];
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
    
    const currentUrl = urlQueue.shift()!;
    
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
    
    const assetType = getAssetType(currentUrl);
    const localPath = urlToLocalPath(currentUrl, url);
    const isExternal = isExternalUrl(currentUrl, baseHost);
    
    // Create asset record
    let asset = await storage.addAsset(jobId, {
      type: assetType,
      originalUrl: currentUrl,
      localPath,
      status: "downloading",
    });
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
      message: `Downloading: ${currentUrl}`,
    }, asset);
    
    // Skip analytics/tracking scripts
    if (shouldSkipUrl(currentUrl)) {
      asset = (await storage.updateAsset(jobId, asset.id, {
        status: "skipped",
        error: "Third-party tracking/analytics script",
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
      const response = await fetchWithTimeout(currentUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type") || "";
      const buffer = await response.arrayBuffer();
      const content = Buffer.from(buffer);
      
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
          { sel: "source[src]", attr: "src" },
          { sel: "source[srcset]", attr: "srcset" },
          { sel: "video[src]", attr: "src" },
          { sel: "video[poster]", attr: "poster" },
          { sel: "audio[src]", attr: "src" },
          { sel: "[style]", attr: "style" },
          { sel: "meta[content]", attr: "content" },
        ];
        
        for (const { sel, attr } of selectors) {
          $(sel).each((_, el) => {
            const value = $(el).attr(attr);
            if (!value) return;
            
            // Handle srcset
            if (attr === "srcset") {
              value.split(",").forEach(src => {
                const urlPart = src.trim().split(/\s+/)[0];
                const normalized = normalizeUrl(urlPart, currentUrl);
                if (normalized && !discoveredUrls.has(normalized)) {
                  discoveredUrls.add(normalized);
                  // Only queue same-origin HTML pages, but fetch all assets
                  const type = getAssetType(normalized);
                  if (type !== "html" || !isExternalUrl(normalized, baseHost)) {
                    urlQueue.push(normalized);
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
                      urlQueue.push(normalized);
                    }
                  }
                });
              }
              return;
            }
            
            // Handle og:image and similar meta tags
            if (attr === "content" && sel === "meta[content]") {
              const property = $(el).attr("property") || $(el).attr("name") || "";
              if (!property.includes("image") && !property.includes("url")) return;
            }
            
            const normalized = normalizeUrl(value, currentUrl);
            if (normalized && !discoveredUrls.has(normalized)) {
              discoveredUrls.add(normalized);
              const type = getAssetType(normalized);
              // Only follow same-origin HTML links
              if (type !== "html" || !isExternalUrl(normalized, baseHost)) {
                urlQueue.push(normalized);
              }
            }
          });
        }
        
        // Extract URLs from inline styles in <style> tags
        $("style").each((_, el) => {
          const cssContent = $(el).html();
          if (cssContent) {
            extractUrlsFromCss(cssContent, currentUrl).forEach(cssUrl => {
              if (!discoveredUrls.has(cssUrl)) {
                discoveredUrls.add(cssUrl);
                urlQueue.push(cssUrl);
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
            urlQueue.push(cssUrl);
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
  
  // Rewrite URLs in HTML and CSS files
  await rewriteUrls(outputDir, url, assetMap);
  
  // Create ZIP archive
  const zipPath = `/tmp/scrape-${jobId}.zip`;
  await createZipArchive(outputDir, zipPath);
  
  return zipPath;
}

function extractUrlsFromCss(css: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
  let match;
  
  while ((match = urlRegex.exec(css)) !== null) {
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

async function rewriteUrls(outputDir: string, baseUrl: string, assetMap: Map<string, Asset>): Promise<void> {
  const htmlFiles = await findFiles(outputDir, [".html", ".htm"]);
  const cssFiles = await findFiles(outputDir, [".css"]);
  
  for (const file of [...htmlFiles, ...cssFiles]) {
    let content = await fs.promises.readFile(file, "utf-8");
    let modified = false;
    
    for (const [originalUrl, asset] of assetMap) {
      if (asset.status !== "success") continue;
      
      // Calculate relative path from current file to asset
      const fileDir = path.dirname(file).replace(outputDir, "");
      const relativePath = path.relative(fileDir || ".", asset.localPath);
      
      // Replace absolute URLs with relative paths
      const urlPatterns = [
        originalUrl,
        originalUrl.replace(/^https?:/, ""),
        new URL(originalUrl).pathname,
      ];
      
      for (const pattern of urlPatterns) {
        if (content.includes(pattern)) {
          content = content.split(pattern).join(relativePath);
          modified = true;
        }
      }
    }
    
    if (modified) {
      await fs.promises.writeFile(file, content);
    }
  }
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
