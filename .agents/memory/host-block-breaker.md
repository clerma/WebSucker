---
name: Host firewall block circuit breaker
description: Sites can firewall the scraper's IP mid-crawl; how the per-host breaker prevents cascade failures and empty "completed" ZIPs.
---

**Rule:** A target site's firewall can rate-limit-block the server IP mid-crawl. After that, EVERY fetch fails with `UND_ERR_CONNECT_TIMEOUT` ("fetch failed"), so one failure cascades into the whole rest of the job failing — and without a guard the job still ends "completed" with an empty ZIP.

**Why:** Confirmed live on a static-HTML site: first ~9 pages succeeded, then the host blocked the IP; every subsequent request (even fresh curl from the shell) connection-timed out for 10+ minutes.

**How to apply:** The scraper has a per-host circuit breaker around `fetchBytesWithTimeout`: retries connect errors with backoff, adds a politeness delay after the first connect failure, pauses ~45s once after several consecutive failures, then marks the host blocked and fails remaining assets fast with a friendly message. Breaker state resets at job start. If the ENTRY page fails, the whole job must be marked failed (never "completed" empty). Don't treat our own AbortError timeout as a connect failure unless the host already showed a real one — slow-but-healthy hosts would trip the breaker falsely. Note: undici's default connect timeout (~10s) fires before our 12s abort, so genuine blocks surface as `fetch failed` with cause `UND_ERR_CONNECT_TIMEOUT`.
