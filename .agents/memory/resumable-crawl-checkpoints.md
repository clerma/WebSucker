---
name: Resumable crawl checkpoints
description: Ownership and cleanup rules for durable crawl checkpoints across worker lease takeover.
---

A crawl checkpoint becomes job-owned shared recovery state as soon as its reference is accepted into the fenced database manifest. A stale or rejected worker must never delete that checkpoint merely because its execution token appears in the object key.

**Why:** A replacement worker may already be restoring the accepted checkpoint when the prior worker discovers that its final commit was rejected. Creator-token-based deletion can destroy the replacement worker's only durable copy.

**How to apply:** Publish a deterministic pending-object intent before upload, atomically accept the completed reference under the active execution fence, and let only the current owner replace/delete it or the job cleanup path expire it. Keep local work paths execution-token scoped.

Checkpoint restoration must stay asynchronous so large archive extraction cannot block execution-lease renewal timers. If a worker observes lease loss, it must yield to abandonment recovery without failing/refunding the job or clearing the manifest/checkpoint.