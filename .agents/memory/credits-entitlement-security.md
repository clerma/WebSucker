---
name: Credits/entitlement security checklist
description: Security rules for the account+credit gating around scrapes and Stripe plan purchases.
---

Rules that must hold for the credits system:

- **Verify-plan account binding**: any endpoint that grants credits/subscription from a Stripe checkout session must check `session.metadata.app === "websucker"` AND `session.metadata.userId === signed-in user id` before granting. Idempotency alone (payments table) is not enough — without the binding check, the first caller steals the purchase.
- **Atomic entitlement consumption**: free-scrape and credit spends are conditional UPDATE ... WHERE (flag=false / credits>0) RETURNING — never read-then-write, or concurrent requests double-spend.
- **Job ownership**: scrape jobs are in-memory; ownership lives in a `jobOwners` Map in routes and is enforced (404, not 403) on job status and download routes. Entries deleted with the job.
- **Session fixation**: `req.session.regenerate()` before setting `userId` on both login and register.

**Why:** architect review found all four as exploitable (credit theft, ZIP access by job-id, free-scrape race, fixation).
**How to apply:** re-check these whenever touching /api/scrape gating, auth routes, or Stripe verify/grant endpoints.
