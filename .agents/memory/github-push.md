---
name: Pushing to GitHub from this repl
description: git push over https fails auth; use the GitHub connection's API instead
---
`git push origin main` fails ("Invalid username or token") — no usable git credential, and the GitHub connection exposes no raw token (Octokit client's `auth()` returns none; settings empty).

**How to apply:** use the connection's `proxyFetch` against the Git Data API: if the target commit already exists on GitHub (e.g. fast-forward to a remote branch tip), just PATCH `/repos/clerma/WebSucker/git/refs/heads/main` with the full 40-char sha. For new local commits, create blob → tree (base_tree = parent commit's tree) → commit → PATCH ref, then `git fetch` and reset local main to origin/main so shas match.

**Why:** local-only commits otherwise diverge from GitHub; the browser rendering path proved API-only pushes work fine for small diffs.
