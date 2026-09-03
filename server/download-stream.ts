import type { Response } from "express";
import type { Readable } from "node:stream";

interface DownloadStreamLease {
  renew: () => Promise<boolean>;
  release: () => Promise<void>;
  renewalMs?: number;
  onError?: (error: Error) => void;
}

export function pipeDownloadWithLease(
  fileStream: Readable,
  res: Response,
  lease: DownloadStreamLease,
): void {
  let finalized = false;
  const renewal = setInterval(() => {
    void lease.renew().catch(error => lease.onError?.(error));
  }, lease.renewalMs ?? 30_000);
  renewal.unref?.();

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    clearInterval(renewal);
    void lease.release().catch(error => lease.onError?.(error));
  };

  fileStream.on("error", (error: Error) => {
    lease.onError?.(error);
    finalize();
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  fileStream.on("end", finalize);
  res.on("finish", finalize);
  res.on("close", () => {
    if (!res.writableFinished) fileStream.destroy();
    finalize();
  });

  fileStream.pipe(res);
}