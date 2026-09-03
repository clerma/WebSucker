import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import type { Response } from "express";
import {
  BACKUP_RETENTION_MS,
  backupExpiresAt,
  formatBackupCountdown,
  isBackupExpired,
} from "../../shared/backup-lifecycle";
import {
  isSafeInternalReturnPath,
  safeInternalReturnPath,
} from "../../shared/navigation";
import { pipeDownloadWithLease } from "../download-stream";

test("completed backups expire exactly eight hours after completion", () => {
  const completedAt = new Date("2026-09-04T12:00:00.000Z");
  assert.equal(BACKUP_RETENTION_MS, 8 * 60 * 60 * 1000);
  assert.equal(backupExpiresAt(completedAt).toISOString(), "2026-09-04T20:00:00.000Z");
  assert.equal(isBackupExpired("2026-09-04T20:00:00.000Z", completedAt.getTime()), false);
  assert.equal(isBackupExpired("2026-09-04T20:00:00.000Z", completedAt.getTime() + BACKUP_RETENTION_MS), true);
  assert.equal(isBackupExpired(undefined, completedAt.getTime()), true);
});

test("long backup windows are shown in hours and minutes", () => {
  assert.equal(formatBackupCountdown(8 * 60 * 60), "8 hr");
  assert.equal(formatBackupCountdown(7 * 60 * 60 + 59 * 60 + 12), "7 hr 59 min");
  assert.equal(formatBackupCountdown(59 * 60 + 12), "59 min");
  assert.equal(formatBackupCountdown(12), "<1 min");
});

test("sign-in return paths accept internal routes and reject external redirects", () => {
  assert.equal(isSafeInternalReturnPath("/backup/job-123?from=email"), true);
  assert.equal(safeInternalReturnPath("/backup/job-123"), "/backup/job-123");
  assert.equal(safeInternalReturnPath("https://evil.example/steal"), "/");
  assert.equal(safeInternalReturnPath("//evil.example/steal"), "/");
  assert.equal(safeInternalReturnPath("/\\evil.example/steal"), "/");
  assert.equal(safeInternalReturnPath("javascript:alert(1)"), "/");
});

test("successful and interrupted downloads leave the shared backup for repeat access", async () => {
  const routes = await readFile("server/routes.ts", "utf8");
  const route = routes.slice(
    routes.indexOf('app.post("/api/scrape/:id/download"'),
    routes.indexOf('app.post("/api/scrape/:id/recover"'),
  );

  assert.match(route, /isDownloadWindowOpen/);
  assert.match(route, /claimDownloadStream/);
  assert.match(route, /releaseDownloadStream/);
  assert.match(route, /downloadArtifact/);
  assert.doesNotMatch(route, /cancelExpiry/);
  assert.doesNotMatch(route, /deleteArtifact/);
  assert.doesNotMatch(route, /deleteJob/);
});

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
const readStream = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
};

test("HTTP stream success, error, and client abort each release the reusable backup lease", async () => {
  for (const outcome of ["success", "error", "abort"] as const) {
    let releases = 0;
    const response = new PassThrough() as PassThrough & Response;
    response.status = (() => response) as Response["status"];
    response.headersSent = false;
    const source = outcome === "success"
      ? Readable.from(Buffer.from("reusable backup"))
      : new PassThrough();

    pipeDownloadWithLease(source, response, {
      renew: async () => true,
      release: async () => { releases += 1; },
      renewalMs: 60_000,
    });

    if (outcome === "error") source.destroy(new Error("simulated artifact read failure"));
    if (outcome === "abort") response.destroy();
    await nextTurn();

    assert.equal(releases, 1, `${outcome} must release exactly once`);
    if (outcome === "abort") assert.equal(source.destroyed, true);
  }

  const reusableSource = () => Readable.from(Buffer.from("reusable backup"));
  assert.equal(await readStream(reusableSource()), "reusable backup");
  assert.equal(await readStream(reusableSource()), "reusable backup");
});