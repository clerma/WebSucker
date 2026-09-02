---
name: Distributed job fencing
description: Rules for safe scrape-job ownership, charging, recovery, and worker takeover across multiple app instances.
---

Use PostgreSQL as the source of truth for job ownership, entitlement, expiry, and operation leases. Every worker-originated mutation—including failure refunds—must be conditional on the current execution token. Recovery transitions must compare-and-swap against the job ID the requester observed.

**Why:** A durable lease only coordinates takeover; it does not stop an old process from continuing after its lease expires. Unfenced writes or refunds from that stale worker can overwrite the replacement worker or restore an already-consumed entitlement.

**How to apply:** When adding scrape lifecycle mutations, run them inside the execution context and include its token in the database predicate. For multi-step recovery or cleanup, atomically claim the exact prior state and make cancellation/competing requests lose cleanly.