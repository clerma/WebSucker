---
name: SPA SEO hook discipline
description: How per-route SEO/meta/JSON-LD is managed in this SPA and the leakage pitfalls to avoid
---

# SPA SEO management

This project has **no react-helmet**. All per-route SEO is done imperatively via the
`useSeo` hook in `client/src/lib/seo.ts` (title, description, canonical, OG/Twitter
mirrors, robots, and JSON-LD).

## Rule: the hook must clear what a route omits
**Why:** In a client-routed SPA the `<head>` persists across navigations. If the hook
only *sets* a field when provided (and never removes it when omitted), the previous
route's `description` / `canonical` / `og:url` / `robots` leak onto the next route —
this was a real review failure. The fix made `useSeo` fully deterministic: when a
field is omitted it is actively removed.

**How to apply:**
- Any new managed `<head>` field added to `useSeo` must have a matching remove branch
  for the omitted case, and be listed in the effect deps.
- Page-specific JSON-LD belongs in the page's `useSeo({ jsonLd })` (cleaned up on
  unmount), NOT in `client/index.html`. Only site-wide schema (SoftwareApplication,
  WebSite/SearchAction) lives in `index.html` — anything page-specific there ships on
  every route.
- Non-indexable routes (admin, checkout success/cancel, 404) pass `noIndex: true`.
- Indexable routes must pass both `description` and `canonicalPath`.
