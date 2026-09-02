import assert from "node:assert/strict";
import test from "node:test";
import { configuredOrigins, isTrustedRequestOrigin } from "../security";

test("origin validation trusts only configured canonical origins", () => {
  const env = {
    APP_BASE_URL: "https://app.example.com/path",
    REPLIT_DOMAINS: "site.replit.app, preview.replit.dev",
    REPLIT_DEV_DOMAIN: "workspace-dev.replit.dev",
  } as NodeJS.ProcessEnv;

  assert.deepEqual(
    [...configuredOrigins(env)].sort(),
    ["https://app.example.com", "https://preview.replit.dev", "https://site.replit.app", "https://workspace-dev.replit.dev"],
  );
  assert.equal(isTrustedRequestOrigin("https://app.example.com", env), true);
  assert.equal(isTrustedRequestOrigin("https://site.replit.app/checkout", env), true);
  assert.equal(isTrustedRequestOrigin("https://app.example.com.evil.test", env), false);
  assert.equal(isTrustedRequestOrigin("https://site.replit.app.evil.test", env), false);
  assert.equal(isTrustedRequestOrigin(undefined, env), false);
  assert.equal(isTrustedRequestOrigin("not a url", env), false);
});

test("origin validation fails closed without trusted origin configuration", () => {
  assert.equal(isTrustedRequestOrigin("http://localhost:5000", {} as NodeJS.ProcessEnv), false);
});