---
name: SPA hydration content loss in scraper
description: Why Puppeteer captures of Wix/React sites can contain LESS content than raw server HTML, and the guards that prevent it
---

Wix (and other React-SSR builders) can WIPE server-rendered content during client hydration and re-render it later. If the DOM is captured mid-hydration (common under crawl load / CPU contention), pages save as empty shells — structure divs intact but text nodes and imgs gone — even though a plain `curl` of the same URL returns full content.

**Why:** Confirmed on a real user scrape of a Wix site: saved gallery page had 2 imgs / no text while raw SSR HTML had 32 imgs and full copy. Isolated repros always passed; only the loaded in-app crawl reproduced it.

**How to apply:** The scraper has two guards in the Puppeteer HTML path: (1) a hydration-settle loop polling `body.innerText` length + iframe count until stable (8s cap) before capture; (2) a content-loss guard that, when the rendered capture looks thin, plain-fetches the URL and keeps the raw server HTML if it scores much richer (text/img heuristics). Never remove these when refactoring the render pipeline. When debugging "missing content" complaints, always diff the saved page against a plain fetch of the live URL first — it instantly shows whether the loss happened at render time.

**Embeds are the inverse case:** JS-created iframes (Wix HtmlComponent → filesusr.com, maps, widgets) exist ONLY in the rendered DOM, never in raw server HTML. Swapping to raw HTML must graft rendered-only iframes back in (match nearest ancestor id shared by both docs) or the swap trades text for the embed. Graft the WHOLE wrapper subtree, not the bare iframe — Wix iframes are 100%x100% absolute and a bare graft into a section container paints over sibling content once loaded.

**Nav is a third loss mode:** Wix menus render their `<li>` items late; a capture can save `<nav><ul></ul></nav>` (visually collapsed) while raw SSR HTML has the full menu. Treat "raw has nav links, rendered has none" as content loss and include nav-link count in any capture-settle heuristics.

**Offline interactivity:** Wix runtime can't boot from file:// (CDN chunks + CORS with null origin), so saved gallery pages get a self-contained injected lightbox. Gallery items have overlay `<a>` elements ON TOP of the imgs — per-image click listeners never fire; use a delegated capture-phase handler with coordinate hit-testing.
