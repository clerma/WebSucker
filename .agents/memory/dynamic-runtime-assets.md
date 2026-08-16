---
name: Dynamic runtime asset capture
description: Why scraped SPAs/Squarespace sites break offline without runtime-loaded webpack chunks, and the capture rules
---

**Rule:** A DOM-only asset crawl misses JS the site loads at runtime (webpack lazy chunks via `import()`/script injection). Offline, the runtime re-requests them at document-origin paths (e.g. `/scripts/<file>` on Squarespace) and interactivity silently breaks (menus, parallax, carousels).

**Why:** Squarespace serves chunks cross-origin from `static1.squarespace.com/.../scripts/*.js`; webpack derives publicPath from the bundle URL, so in an offline copy it falls back to `<origin>/scripts/<file>`. Chunks never appear as `<script src>` tags, so HTML rewriting can't help.

**How to apply:**
- Capture `page.on("response")` script/stylesheet bodies during render (skip trackers, per-file + total budget), and AWAIT pending captures before returning — the listener is async and races page close.
- Save same-origin files at their literal site path AND mirror any trailing `/scripts/<file>` segment to `scripts/<basename>` (same-origin wins collisions).
- Never swap a missing `<script src>` for the image placeholder — MIME errors + kills embed loaders. Remove skipped trackers; keep other external scripts absolute.
- Before serializing HTML, strip open-menu state classes the interaction sweep leaves behind (`header-menu-nav-folder--active` etc.) — a serialized-open invisible overlay swallows every click offline.
