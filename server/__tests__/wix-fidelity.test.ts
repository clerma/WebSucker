import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { scraperTestUtils } from "../scraper";

const fixturePath = fileURLToPath(
  new URL("../__fixtures__/dupuis-wix-regression.html", import.meta.url),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("Wix srcset candidates preserve transform commas and optional separator whitespace", () => {
  const srcset =
    "https://static.wixstatic.com/media/hash.jpg/v1/fill/w_100,h_200,q_90/image.jpg 1x," +
    "https://static.wixstatic.com/media/hash.jpg/v1/fill/w_200,h_400,q_90/image.jpg 2x";

  assert.deepEqual(scraperTestUtils.parseSrcset(srcset), [
    {
      url: "https://static.wixstatic.com/media/hash.jpg/v1/fill/w_100,h_200,q_90/image.jpg",
      descriptor: "1x",
    },
    {
      url: "https://static.wixstatic.com/media/hash.jpg/v1/fill/w_200,h_400,q_90/image.jpg",
      descriptor: "2x",
    },
  ]);
});

test("standalone Wix transform fragments never become crawl URLs", () => {
  const invalidFragments = [
    "/h_399",
    "/w_720",
    "/al_c",
    "/q_90",
    "/blur_30",
    "/enc_avif",
    "/usm_0.66_1.00_0.01",
    "/quality_auto/03ce9f_logo~mv2.png",
  ];

  for (const fragment of invalidFragments) {
    assert.equal(
      scraperTestUtils.normalizeUrl(fragment, "https://www.dupuispackage.com/"),
      null,
      `${fragment} must be rejected`,
    );
  }
});

test("nested Wix CDN URLs unwrap to the same canonical media hash", () => {
  const canonical =
    "https://static.wixstatic.com/media/03ce9f_logo~mv2.png";
  const nested =
    "https://static.wixstatic.com/media/https://static.wixstatic.com/media/03ce9f_logo~mv2.png";

  assert.equal(scraperTestUtils.resolveWixUri(nested), canonical);
  assert.equal(
    scraperTestUtils.extractWixMediaHash(nested),
    "03ce9f_logo~mv2.png",
  );
});

test("Dupuis fixture stays visible offline and all Wix image variants resolve locally", async () => {
  const outputDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dupuis-wix-regression-"),
  );
  temporaryDirectories.push(outputDirectory);

  const fixture = await fs.readFile(fixturePath, "utf8");
  await fs.writeFile(path.join(outputDirectory, "index.html"), fixture);

  const canonicalMediaUrl =
    "https://static.wixstatic.com/media/03ce9f_logo~mv2.png";
  const discoveredUrls = new Set<string>();
  const crawlQueue: Array<{ url: string; referrer: string }> = [];
  scraperTestUtils.enqueueWixDataImageUrls(
    cheerio.load(fixture),
    discoveredUrls,
    crawlQueue,
    "https://www.dupuispackage.com/",
  );
  assert.deepEqual(crawlQueue, [
    {
      url: canonicalMediaUrl,
      referrer: "https://www.dupuispackage.com/",
    },
  ]);

  // Simulate the normal downloader consuming the production crawl queue. The
  // asset map is derived exclusively from queue discovery rather than seeded
  // with knowledge of the expected Wix URL.
  const assets = new Map<string, any>();
  for (const [index, queued] of crawlQueue.entries()) {
    const localPath = `assets/images/discovered-wix-${index}.png`;
    await fs.mkdir(path.join(outputDirectory, path.dirname(localPath)), {
      recursive: true,
    });
    await fs.writeFile(path.join(outputDirectory, localPath), "fixture image");
    assets.set(queued.url, {
      id: `fixture-image-${index}`,
      type: "image",
      originalUrl: queued.url,
      localPath,
      status: "success",
      referencedFrom: queued.referrer,
    });
  }

  await scraperTestUtils.transformForOffline(outputDirectory);
  await scraperTestUtils.rewriteUrls(
    outputDirectory,
    "https://www.dupuispackage.com/",
    assets as any,
  );

  const offlineHtml = await fs.readFile(
    path.join(outputDirectory, "index.html"),
    "utf8",
  );
  const $ = cheerio.load(offlineHtml);

  for (const expectedText of [
    "Dupuis Package, CARENCRO LOUISIANA",
    "MENU",
    "DUPUIS PACKAGE",
    "YOUR RECIPE OUR PRECISION",
    "We provide smooth co-packing for sauces and marinades.",
    "Get Started",
  ]) {
    assert.match($("body").text(), new RegExp(expectedText));
  }

  $("[id^='comp-']").each((_, element) => {
    assert.equal(
      $(element).attr("data-motion-enter"),
      "done",
      `${$(element).attr("id")} must be frozen in its visible motion state`,
    );
  });
  assert.equal($(".hidden-during-prewarmup").length, 0);

  const logo = $("#comp-logo");
  assert.equal(logo.attr("src"), "assets/images/discovered-wix-0.png");
  assert.equal(
    logo.attr("srcset"),
    "assets/images/discovered-wix-0.png 1x, assets/images/discovered-wix-0.png 2x",
  );
  assert.equal(
    $("#comp-nested-media").attr("src"),
    "assets/images/discovered-wix-0.png",
  );
  assert.doesNotMatch(offlineHtml, /_placeholder\.svg/);
  assert.doesNotMatch(
    offlineHtml,
    /(?:src|srcset)=["'][^"']*static\.wixstatic\.com/i,
  );
  assert.doesNotMatch(
    offlineHtml,
    /\/(?:h_\d+|w_\d+|al_c|q_\d+|blur_\d+|enc_avif|quality_auto)\b/i,
  );
});