import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SLEEP_MARKERS = [
  "endpoint has been disabled",
  "endpoint is disabled",
  "Connection terminated unexpectedly",
  "ECONNRESET",
  "ETIMEDOUT",
  "Connection terminated due to connection timeout",
];

function isSleepingDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return SLEEP_MARKERS.some((m) => msg.includes(m));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
(pool as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = async (...args) => {
  const delays = [500, 1500, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await originalQuery(...args);
    } catch (err) {
      lastErr = err;
      if (attempt === delays.length || !isSleepingDbError(err)) throw err;
      console.warn(
        `[db] sleeping endpoint detected, retrying in ${delays[attempt]}ms (attempt ${attempt + 1}/${delays.length})`,
      );
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
};

export const db = drizzle(pool, { schema });
