import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SHARE_IMAGE_URL =
  "https://websitesucker.com/website-sucker-share-v1.png";

test("social metadata uses the published branded share image", async () => {
  const html = await readFile("client/index.html", "utf8");
  assert.match(html, new RegExp(
    `<meta property="og:image" content="${SHARE_IMAGE_URL}"`,
  ));
  assert.match(html, new RegExp(
    `<meta property="og:image:secure_url" content="${SHARE_IMAGE_URL}"`,
  ));
  assert.match(html, new RegExp(
    `<meta name="twitter:image" content="${SHARE_IMAGE_URL}"`,
  ));
  assert.match(html, /<meta property="og:image:width" content="1200"/);
  assert.match(html, /<meta property="og:image:height" content="630"/);
  assert.doesNotMatch(html, /og-image\.png/);
});

test("the branded share image has the declared Open Graph dimensions", async () => {
  const png = await readFile("client/public/website-sucker-share-v1.png");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});