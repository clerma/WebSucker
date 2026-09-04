---
name: Email outbox idempotency
description: Durable delivery rules for transactional email where the provider's idempotency guarantee has a finite lifetime.
---

Persist a stable business-event key and the complete immutable email payload before sending. Claim sends with a renewable database lease, fence the post-send update by claim token, and reuse one provider idempotency key for every retry.

Bound automatic retries to less than the email provider's documented idempotency retention. Keep failures after that cutoff as durable records for reconciliation rather than risking a duplicate with a late blind retry.

**Why:** Sending email and committing `sent` state cannot share a transaction. A crash after provider acceptance but before the database update creates an unknown outcome. Resend retains idempotency keys for 24 hours; retrying the same request after that window can send a duplicate.

**How to apply:** For Resend transactional outboxes, freeze the first persisted payload, use a per-entity key, renew/fence the send lease, and keep automatic retries within 23 hours. Surface older unresolved records instead of automatically resending.