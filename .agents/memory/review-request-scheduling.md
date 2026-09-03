---
name: Review request scheduling
description: Durable delivery and deduplication rules for post-purchase review requests.
---

Schedule each customer's review-request email with Resend when the verified Stripe checkout webhook is processed. Keep the schedule claim in PostgreSQL and deduplicate by normalized recipient email.

**Why:** The production deployment is autoscaled and may sleep, so an in-process daily timer is not reliable. Stripe webhook retries plus a durable claim make scheduling recoverable, while one request per email prevents subscription renewals or repeat purchases from spamming customers.

**How to apply:** The webhook should release its database claim if Resend scheduling fails so Stripe can retry. Do not move the delay into `setTimeout`, `setInterval`, or a second always-running workflow unless the deployment model changes.