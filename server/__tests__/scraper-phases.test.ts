import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResumeQueueItems,
  createZipArchive,
  crawlPhaseForUrl,
  enqueueCrawlCandidate,
  extractZipArchive,
  selectNextCrawlQueue,
} from "../scraper";
import type { Asset } from "@shared/schema";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const queues = () => ({
  html: [] as Array<{ url: string; referrer: string }>,
  code: [] as Array<{ url: string; referrer: string }>,
  media: [] as Array<{ url: string; referrer: string }>,
});

test("crawl candidates are classified into page, shared-code, and media phases", () => {
  assert.equal(crawlPhaseForUrl("https://example.com/about"), "pages");
  assert.equal(crawlPhaseForUrl("https://example.com/styles/site.css"), "code");
  assert.equal(crawlPhaseForUrl("https://example.com/scripts/app.js"), "code");
  assert.equal(crawlPhaseForUrl("https://example.com/fonts/site.woff2"), "code");
  assert.equal(crawlPhaseForUrl("https://cdn.example.com/image.webp"), "media");
});

test("page work always preempts code and media regardless of discovery order", () => {
  const state = queues();
  const discovered = new Set<string>();
  enqueueCrawlCandidate(state, discovered, { url: "https://example.com/photo.jpg", referrer: "entry" });
  enqueueCrawlCandidate(state, discovered, { url: "https://example.com/app.js", referrer: "entry" });
  enqueueCrawlCandidate(state, discovered, { url: "https://example.com/contact", referrer: "entry" });

  assert.equal(selectNextCrawlQueue(state)?.phase, "pages");
  state.html.shift();
  assert.equal(selectNextCrawlQueue(state)?.phase, "code");
  state.code.shift();
  assert.equal(selectNextCrawlQueue(state)?.phase, "media");
});

test("the durable manifest deduplicates a URL across repeated discoveries", () => {
  const state = queues();
  const discovered = new Set<string>();
  const item = { url: "https://example.com/shared.css", referrer: "https://example.com/" };

  assert.equal(enqueueCrawlCandidate(state, discovered, item), true);
  assert.equal(enqueueCrawlCandidate(state, discovered, { ...item, referrer: "https://example.com/about" }), false);
  assert.equal(state.code.length, 1);
  assert.equal(state.html.length + state.media.length, 0);
});

test("restart repair repeats only unfinished items and files newer than the accepted checkpoint", () => {
  const asset = (id: string, status: Asset["status"], localPath: string): Asset => ({
    id,
    type: "image",
    originalUrl: `https://example.com/${localPath}`,
    localPath,
    status,
    referencedFrom: "https://example.com/catalog",
  });
  const assets = [
    asset("present", "success", "present.jpg"),
    asset("missing", "success", "missing.jpg"),
    asset("in-flight", "downloading", "in-flight.jpg"),
    asset("failed", "failed", "failed.jpg"),
  ];

  const resumed = buildResumeQueueItems(
    assets,
    localPath => localPath === "present.jpg",
    "https://example.com/",
  );
  assert.deepEqual(
    resumed.map(item => item.url),
    [
      "https://example.com/missing.jpg",
      "https://example.com/in-flight.jpg",
    ],
  );
});

test("checkpoint extraction yields to lease-renewal timers", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "crawl-restore-test-"));
  const source = path.join(root, "source");
  const restored = path.join(root, "restored");
  const zipPath = path.join(root, "checkpoint.zip");
  await fs.mkdir(source);
  await fs.mkdir(restored);
  await fs.writeFile(path.join(source, "page.html"), "<main>checkpoint</main>");
  await createZipArchive(source, zipPath);

  let renewalTicked = false;
  const renewal = setTimeout(() => {
    renewalTicked = true;
  }, 0);
  try {
    await extractZipArchive(zipPath, restored);
    assert.equal(renewalTicked, true);
    assert.equal(await fs.readFile(path.join(restored, "page.html"), "utf8"), "<main>checkpoint</main>");
  } finally {
    clearTimeout(renewal);
    await fs.rm(root, { recursive: true, force: true });
  }
});