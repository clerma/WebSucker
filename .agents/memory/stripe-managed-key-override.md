---
name: Stripe managed key override
description: Why STRIPE_SECRET_KEY cannot be overridden by user secrets and how the app sources its live key
---

`STRIPE_SECRET_KEY` in the environment is injected by the Replit Stripe integration (a managed restricted `rk_live_…` key, `mk_…` in the dashboard). User edits to a secret with that name never take effect — the injected value wins. The app therefore reads `STRIPE_LIVE_SECRET_KEY` first (see server/stripeClient.ts), which holds the user's own full-permission `sk_live_…` key.

**Why:** The managed restricted key lacks `accounts_kyc_basic_read` and `webhook_read/write`, so the sync engine (`stripe-replit-sync`) failed on account retrieval and managed-webhook registration. Hours were lost believing the user's secret pastes weren't saving; they were simply shadowed by the injected value.

**How to apply:** Never diagnose Stripe auth issues by assuming `process.env.STRIPE_SECRET_KEY` reflects the user's secret. If Stripe calls fail with `more_permissions_required` on an `rk_live_` key, check which env var the code reads and prefer `STRIPE_LIVE_SECRET_KEY`. Also: editing a restricted key's permissions in Stripe mints a NEW key value; and Stripe's dashboard shows publishable (`pk_`), restricted (`rk_`), and secret (`sk_`) keys — verify the prefix of what got saved.
