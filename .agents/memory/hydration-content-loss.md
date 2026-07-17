---
name: SPA hydration content loss in scraper
description: Why Puppeteer captures of Wix/React sites can contain LESS content than raw server HTML, and the guards that prevent it
---

Wix (and other React-SSR builders) can WIPE server-rendered content during client hydration and re-render it later. If the DOM is captured mid-hydration (common under crawl load / CPU contention), pages save as empty shells — structure divs intact but text nodes and imgs gone — even though a plain `curl` of the same URL returns full content.

**Why:** Confirmed on a real user scrape of a Wix site: saved gallery page had 2 imgs / no text while raw SSR HTML had 32 imgs and full copy. Isolated repros always passed; only the loaded in-app crawl reproduced it.

**How to apply:** The scraper has two guards in the Puppeteer HTML path: (1) a hydration-settle loop polling `body.innerText` length until stable (8s cap) before capture; (2) a content-loss guard that, when the rendered capture looks thin, plain-fetches the URL and keeps the raw server HTML if it scores much richer (text/img heuristics). Never remove these when refactoring the render pipeline. When debugging "missing content" complaints, always diff the saved page against a plain fetch of the live URL first — it instantly shows whether the loss happened at render time.
