---
name: Credits/entitlement security checklist
description: Security rules for the account+credit gating around scrapes and Stripe plan purchases.
---

Rules that must hold for the credits system:

- **Verify-plan account binding**: any endpoint that grants credits/subscription from a Stripe checkout session must check `session.metadata.app === "websucker"` AND `session.metadata.userId === signed-in user id` before granting. Idempotency alone (payments table) is not enough — without the binding check, the first caller steals the purchase.
- **Atomic entitlement consumption**: free-scrape and credit spends are conditional UPDATE ... WHERE (flag=false / credits>0) RETURNING — never read-then-write, or concurrent requests double-spend.
- **Atomic Stripe fulfillment**: the unique payment marker and credit increment must commit in the same transaction so a crash cannot record a paid session without granting its credits.
- **Durable job ownership**: ownership, authorization, and worker/charging leases live in PostgreSQL and use conditional token-fenced updates. Owner mismatches fail closed as 404.
- **Session fixation**: `req.session.regenerate()` before setting `userId` on both login and register.

**Why:** architect review found these boundaries vulnerable to credit theft/loss, cross-job ZIP access, double spending, multi-server races, and session fixation.
**How to apply:** re-check these whenever touching /api/scrape gating, auth routes, or Stripe verify/grant endpoints.
