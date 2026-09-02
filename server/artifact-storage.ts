import { Client } from "@replit/object-storage";
import type { Readable } from "stream";

export const APP_STORAGE_PREFIX = "app-storage:";
const OBJECT_ROOT = "website-sucker/jobs";
let client: Client | undefined;
const storageClient = () => client ??= new Client();

function safeIdentifier(value: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(value);
}

export function objectKeyForJob(jobId: string, executionToken: string): string {
  if (!safeIdentifier(jobId) || !safeIdentifier(executionToken)) throw new Error("Invalid artifact identifier");
  return `${OBJECT_ROOT}/${jobId}/${executionToken}.zip`;
}

export function objectReference(jobId: string, executionToken: string): string {
  return `${APP_STORAGE_PREFIX}${objectKeyForJob(jobId, executionToken)}`;
}

export function parseObjectReference(reference: string): string | null {
  return reference.startsWith(APP_STORAGE_PREFIX)
    ? reference.slice(APP_STORAGE_PREFIX.length)
    : null;
}

export async function uploadArtifact(jobId: string, executionToken: string, filename: string): Promise<string> {
  const key = objectKeyForJob(jobId, executionToken);
  try {
    const result = await storageClient().uploadFromFilename(key, filename, { compress: false });
    if (!result.ok) throw new Error(`Artifact upload failed: ${result.error.message}`);
    return `${APP_STORAGE_PREFIX}${key}`;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.warn(
      `[artifact-storage] App Storage unavailable in development; retaining local ZIP for job ${jobId}:`,
      error instanceof Error ? error.message : error,
    );
    return filename;
  }
}

export async function artifactExists(reference: string): Promise<boolean> {
  const key = parseObjectReference(reference);
  if (!key) return process.env.NODE_ENV !== "production";
  const result = await storageClient().exists(key);
  if (!result.ok) throw new Error(`Artifact lookup failed: ${result.error.message}`);
  return result.value;
}

export function downloadArtifact(reference: string): Readable | null {
  const key = parseObjectReference(reference);
  return key ? storageClient().downloadAsStream(key, { decompress: false }) : null;
}

export async function deleteArtifact(reference: string | undefined): Promise<void> {
  if (!reference) return;
  const key = parseObjectReference(reference);
  if (!key) return;
  const result = await storageClient().delete(key, { ignoreNotFound: true });
  if (!result.ok) throw new Error(`Artifact deletion failed: ${result.error.message}`);
}