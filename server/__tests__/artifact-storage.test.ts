import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_STORAGE_PREFIX, objectKeyForJob, objectReference, parseObjectReference,
} from "../artifact-storage";

test("artifact references are deterministic and distinguish shared objects from legacy paths", () => {
  const jobId = "123e4567-e89b-12d3-a456-426614174000";
  const token = "987e6543-e21b-12d3-a456-426614174999";
  const key = objectKeyForJob(jobId, token);
  assert.equal(key, `website-sucker/jobs/${jobId}/${token}.zip`);
  assert.equal(objectReference(jobId, token), `${APP_STORAGE_PREFIX}${key}`);
  assert.equal(parseObjectReference(`${APP_STORAGE_PREFIX}${key}`), key);
  assert.equal(parseObjectReference("/tmp/legacy.zip"), null);
  assert.throws(() => objectKeyForJob("../escape", token));
  assert.throws(() => objectKeyForJob(jobId, "../escape"));
});

test("different execution tokens cannot address each other's artifacts", () => {
  const jobId = "123e4567-e89b-12d3-a456-426614174000";
  assert.notEqual(objectKeyForJob(jobId, "worker-a"), objectKeyForJob(jobId, "worker-b"));
});