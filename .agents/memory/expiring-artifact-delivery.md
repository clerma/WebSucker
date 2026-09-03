---
name: Expiring artifact delivery
description: Concurrency rules for retained ZIPs, cleanup, active downloads, and completion notifications.
---

Write an artifact's retention deadline atomically with durable completion. Treat that database deadline as authoritative on every status, payment, entitlement, and download path; timers are only cleanup optimizations.

Before entitlement work or streaming, atomically claim an owner-bound, renewable database stream lease. Expiry cleanup must skip active stream leases, and finish, error, and abort paths must release them. Entitlement consumption that is tied to an artifact must verify ownership and future expiry in the same transaction that consumes it.

Send completion notifications only after durable completion through a persisted claim/retry state, with a stable per-job idempotency key. Notification failure must remain visible without changing artifact completion.

**Why:** Separate check-then-act steps allowed cleanup to delete a ZIP after authorization but before streaming, and could consume an access code after expiry. Process-local timers and direct post-write email calls also fail under restarts or duplicate workers.

**How to apply:** Use these rules for any downloadable artifact with a retention window, especially when payment or credits can be consumed and multiple workers can perform cleanup or notifications.