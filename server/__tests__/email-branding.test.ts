import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildEmailVerificationEmail,
  buildPasswordResetEmail,
  buildReviewRequestEmail,
  buildReviewSubmissionEmail,
} from "../email";

const ORIGINAL_APP_BASE_URL = process.env.APP_BASE_URL;
process.env.APP_BASE_URL = "https://www.websitesucker.com";

test.after(() => {
  if (ORIGINAL_APP_BASE_URL === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = ORIGINAL_APP_BASE_URL;
});

test("email logo is a dedicated PNG generated from the current brand mark", async () => {
  const logo = await readFile("client/public/website-sucker-email-logo.png");
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(logo.byteLength > 10_000);
});

test("all transactional templates use the shared branded header and HTTPS logo", () => {
  const scheduledAt = new Date("2026-09-04T12:00:00.000Z");
  const messages = [
    buildPasswordResetEmail("customer@example.com", "https://www.websitesucker.com/reset-password?token=reset-token"),
    buildEmailVerificationEmail("customer@example.com", "https://www.websitesucker.com/verify-email?token=verify-token"),
    buildReviewRequestEmail("customer@example.com", "https://www.websitesucker.com/review", scheduledAt),
    buildReviewSubmissionEmail({
      name: "Customer",
      email: "customer@example.com",
      rating: 5,
      review: "Website Sucker worked perfectly.",
    }),
  ];

  for (const message of messages) {
    assert.match(message.html, /<table role="presentation"/);
    assert.match(message.html, /src="https:\/\/www\.websitesucker\.com\/website-sucker-email-logo\.png"/);
    assert.match(message.html, /alt="Website Sucker logo"/);
    assert.match(message.html, />WebsiteSucker</);
    assert.match(message.html, /Website Sucker &middot; Reliable offline website backups/);
    assert.equal(message.from, "Website Sucker <noreply@websitesucker.com>");
  }
});

test("account emails retain recipients, action links, and expiry copy", () => {
  const resetUrl = "https://www.websitesucker.com/reset-password?token=one&next=%22safe%22";
  const reset = buildPasswordResetEmail("reset@example.com", resetUrl);
  assert.deepEqual(reset.to, ["reset@example.com"]);
  assert.equal(reset.subject, "Reset your Website Sucker password");
  assert.match(reset.html, /Reset password/);
  assert.match(reset.html, /token=one&amp;next=%22safe%22/);
  assert.match(reset.html, /expires in 1 hour/);

  const verificationUrl = "https://www.websitesucker.com/verify-email?token=two";
  const verification = buildEmailVerificationEmail("verify@example.com", verificationUrl);
  assert.deepEqual(verification.to, ["verify@example.com"]);
  assert.equal(verification.subject, "Verify your Website Sucker email");
  assert.match(verification.html, /Verify email/);
  assert.match(verification.html, /token=two/);
  assert.match(verification.html, /expires in 1 hour/);
});

test("review emails retain scheduling, routing, reply-to, and escaped content", () => {
  const scheduledAt = new Date("2026-09-04T12:00:00.000Z");
  const request = buildReviewRequestEmail(
    "buyer@example.com",
    "https://www.websitesucker.com/review?source=email&campaign=review",
    scheduledAt,
  );
  assert.deepEqual(request.to, ["buyer@example.com"]);
  assert.equal(request.scheduled_at, scheduledAt.toISOString());
  assert.match(request.html, /Share your review/);
  assert.match(request.html, /source=email&amp;campaign=review/);

  const notification = buildReviewSubmissionEmail({
    name: "<Customer>",
    email: "customer@example.com",
    rating: 4,
    review: "<script>alert('bad')</script> Great backup.",
  });
  assert.deepEqual(notification.to, ["hello@websitesucker.com"]);
  assert.equal(notification.reply_to, "customer@example.com");
  assert.equal(notification.subject, "New 4-star Website Sucker review");
  assert.match(notification.html, /★★★★☆/);
  assert.doesNotMatch(notification.html, /<script>/);
  assert.match(notification.html, /&lt;script&gt;alert\(&#039;bad&#039;\)&lt;\/script&gt;/);
  assert.match(notification.html, /&lt;Customer&gt;/);
});

test("email branding refuses non-HTTPS asset origins", () => {
  process.env.APP_BASE_URL = "http://insecure.example.com";
  assert.throws(
    () => buildPasswordResetEmail("customer@example.com", "https://www.websitesucker.com/reset"),
    /trusted HTTPS origin/,
  );
  process.env.APP_BASE_URL = "https://www.websitesucker.com";
});