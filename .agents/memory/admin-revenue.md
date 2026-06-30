---
name: Admin revenue computation
description: How admin dashboard revenue/MRR is computed and the subscription-renewal pitfall
---

# Admin dashboard revenue

**Source of truth = Stripe succeeded charges**, NOT `checkout.sessions` or the local
`payments` table.

**Why:** A subscription's monthly renewal creates an invoice + charge but **no new
checkout session**. Deriving revenue from `checkout.sessions` (or our `payments`
table, which only records the initial checkout) therefore makes every renewal after
month one invisible — that was the reported "subscription charges not shown as
revenue" bug.

**How to apply (in the `/api/admin/stats` handler):**
- Sum every succeeded charge, net of refunds (`amount_captured - amount_refunded`).
  A charge with an `invoice` is a subscription payment (initial or renewal); without
  one it's a one-time download.
- `charges.list` is newest-first — keep the first 50 succeeded for the activity feed
  while still summing all pages for the lifetime total.
- True MRR + active subscriber count come from `subscriptions.list({status:"active"})`,
  normalising each item's amount to a monthly figure by billing interval.
- Charges and subscriptions are fetched in **independent** try/catch blocks with
  separate readiness flags, and the local `payments` table is a **per-metric**
  fallback only when its Stripe fetch fails.
- No product/price filtering: this is a dedicated single-product Stripe account, so
  filtering would risk dropping legitimate revenue.
- The restricted Stripe key lacks `accounts_kyc_basic_read`, so `StripeSync` account
  init fails at startup — this is unrelated to charges/subscriptions reads, which work.
