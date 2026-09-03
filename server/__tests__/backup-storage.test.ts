import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { accessCodes, scrapeJobs, users } from "../../shared/schema";
import { db } from "../db";
import { storage } from "../storage";

test("job access-code redemption is atomic across expiry and ownership", async () => {
  const suffix = randomUUID();
  const code = `WS-${suffix.slice(0, 5).toUpperCase()}-${suffix.slice(5, 10).toUpperCase()}`;
  const jobId = randomUUID();
  const [owner] = await db.insert(users).values({
    email: `backup-owner-${suffix}@example.com`,
    passwordHash: "test-only",
    emailVerified: true,
  }).returning({ id: users.id });
  const [otherUser] = await db.insert(users).values({
    email: `backup-other-${suffix}@example.com`,
    passwordHash: "test-only",
    emailVerified: true,
  }).returning({ id: users.id });

  try {
    await db.insert(accessCodes).values({ code, note: "atomic expiry test", maxUses: 1 });
    await db.insert(scrapeJobs).values({
      id: jobId,
      ownerId: owner.id,
      url: "https://example.com",
      status: "completed",
      assets: [],
      completedAt: new Date(Date.now() - 10_000),
      expiresAt: new Date(Date.now() - 1_000),
      downloadPath: "test-only.zip",
      fundingMethod: "free",
    });

    assert.equal(
      await storage.redeemAccessCodeForJob(code, jobId, owner.id),
      "expired",
    );
    let [storedCode] = await db.select().from(accessCodes).where(eq(accessCodes.code, code));
    let [storedJob] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
    assert.equal(storedCode.uses, 0);
    assert.equal(storedJob.downloadAuthorized, false);

    await db.update(scrapeJobs)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(scrapeJobs.id, jobId));
    assert.equal(
      await storage.redeemAccessCodeForJob(code, jobId, otherUser.id),
      "invalid_job",
    );
    [storedCode] = await db.select().from(accessCodes).where(eq(accessCodes.code, code));
    assert.equal(storedCode.uses, 0);

    assert.equal(
      await storage.redeemAccessCodeForJob(code, jobId, owner.id),
      "authorized",
    );
    [storedCode] = await db.select().from(accessCodes).where(eq(accessCodes.code, code));
    [storedJob] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId));
    assert.equal(storedCode.uses, 1);
    assert.equal(storedJob.downloadAuthorized, true);
  } finally {
    await db.delete(scrapeJobs).where(eq(scrapeJobs.id, jobId));
    await db.delete(accessCodes).where(eq(accessCodes.code, code));
    await db.delete(users).where(eq(users.id, owner.id));
    await db.delete(users).where(eq(users.id, otherUser.id));
  }
});

test("active download leases prevent expiry cleanup until release or timeout", async () => {
  const suffix = randomUUID();
  const releasedJobId = randomUUID();
  const timedOutJobId = randomUUID();
  const [owner] = await db.insert(users).values({
    email: `download-lease-owner-${suffix}@example.com`,
    passwordHash: "test-only",
    emailVerified: true,
  }).returning({ id: users.id });

  try {
    const futureExpiry = new Date(Date.now() + 60_000);
    await db.insert(scrapeJobs).values([
      {
        id: releasedJobId,
        ownerId: owner.id,
        url: "https://release.example.com",
        status: "completed",
        assets: [],
        completedAt: new Date(),
        expiresAt: futureExpiry,
        downloadPath: "release-test-only.zip",
        fundingMethod: "payment",
      },
      {
        id: timedOutJobId,
        ownerId: owner.id,
        url: "https://timeout.example.com",
        status: "completed",
        assets: [],
        completedAt: new Date(),
        expiresAt: futureExpiry,
        downloadPath: "timeout-test-only.zip",
        fundingMethod: "payment",
      },
    ]);

    const releasedToken = await storage.claimDownloadStream(releasedJobId, owner.id, 60_000);
    const timedOutToken = await storage.claimDownloadStream(timedOutJobId, owner.id, 60_000);
    assert.ok(releasedToken);
    assert.ok(timedOutToken);

    await db.update(scrapeJobs)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(scrapeJobs.id, releasedJobId));
    await db.update(scrapeJobs)
      .set({
        expiresAt: new Date(Date.now() - 1_000),
        downloadLeaseUntil: new Date(Date.now() - 1_000),
      })
      .where(eq(scrapeJobs.id, timedOutJobId));

    assert.equal(await storage.claimCleanup(releasedJobId, 60_000), false);
    assert.equal(await storage.claimCleanup(timedOutJobId, 60_000), true);

    await storage.releaseDownloadStream(releasedJobId, releasedToken);
    assert.equal(await storage.claimCleanup(releasedJobId, 60_000), true);
  } finally {
    await db.delete(scrapeJobs).where(eq(scrapeJobs.id, releasedJobId));
    await db.delete(scrapeJobs).where(eq(scrapeJobs.id, timedOutJobId));
    await db.delete(users).where(eq(users.id, owner.id));
  }
});