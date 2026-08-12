---
name: Stripe webhook verification
description: Why webhook signature verification must not depend on live Stripe API calls in this project
---

The webhook route verifies signatures locally against the managed-webhook signing secrets that the sync engine stores in the `stripe."_managed_webhooks"` table (one row per mode, test + live), and only then runs the sync engine as best-effort.

**Why:** The sync engine's built-in `processWebhook` first calls `accounts.retrieve` to look up the secret; the live restricted key (`rk_live_…`) lacks that permission, so every webhook 400'd and payment records would be silently lost.

**How to apply:** Any new webhook-driven behavior should hook into the local verification path (server/webhookHandlers.ts) and treat sync-engine failures as non-fatal after the business record is stored. If webhooks start failing again, check key permissions and whether `_managed_webhooks` has a row for the active mode.
