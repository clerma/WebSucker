---
name: Managed database migration
description: Safeguards for moving this project from a legacy DATABASE_URL override to Replit-managed development and production databases.
---

Remove a legacy `DATABASE_URL` from deployment secrets only after validating backups and comparing development and production record counts. Never use an option that replaces production with development data when production is newer; publish should apply additive schema changes while retaining production records.

**Why:** this project had an external development override while its managed production database already contained newer live user and payment data. Blindly seeding production from development would have lost live records.

**How to apply:** compare aggregate counts first, migrate only development data into the managed development database, and confirm production remains unchanged. If replacing the public schema, account for Stripe tables whose triggers depend on helper functions in public; restore and verify those triggers explicitly.