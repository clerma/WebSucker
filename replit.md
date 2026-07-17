# Website Sucker

Website Sucker is a web-based tool that allows users to scrape and analyze any website, then download a complete offline backup.

## Run & Operate

- Run both frontend and backend: `npm run dev`
- Required Environment Variables: `ADMIN_SECRET` (for admin dashboard password)

## Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, Shadcn/UI, Wouter
- **Backend**: Express.js, Node.js, WebSocket (ws), Puppeteer, Cheerio, Archiver
- **Payments**: Stripe (via Replit integration), stripe-replit-sync
- **Database**: PostgreSQL (for Stripe schema sync)
- **State Management**: TanStack Query
- **Build Tool**: Vite

## Where things live

- **Client Source**: `client/src/`
    - Components: `client/src/components/`
    - Pages: `client/src/pages/`
- **Server Source**: `server/`
    - API Endpoints & WebSockets: `server/routes.ts`
    - Core Scraper Logic: `server/scraper.ts`
    - Stripe Integration: `server/stripeClient.ts`, `server/webhookHandlers.ts`
    - Admin-related: `server/seed-products.ts`
- **Shared Types**: `shared/schema.ts`
- **Blog Articles**: `client/src/data/articles.ts`

## Architecture decisions

- **Dynamic Content Handling**: Uses Puppeteer for scraping to capture JavaScript-rendered content, embeds, and lazy-loaded assets.
- **Wix CDN Normalization**: Rewrites Wix CDN image URLs to their base form to prevent duplicate downloads and handle various image transformations.
- **Static Site Optimization**: Implements `probeNeedsPuppeteer()` to skip Puppeteer for static HTML sites, significantly reducing scrape time.
- **Robust Error Handling**: HTTP 429 retry with exponential backoff. Cloudflare bypass tier-list (in order): (1) `puppeteer-extra-plugin-stealth` + rotating UA/viewport/lang/sec-ch-ua fingerprints + humanlike mouse jitter + Turnstile-checkbox click + 45s wait. (2) `CapSolver` AntiTurnstileTaskProxyLess (`CAPSOLVER_API_KEY`) — only works when sitekey is exposed; Cloudflare "Managed Challenge" interstitials don't expose one. (3) `ScrapingBee` `stealth_proxy=true` + `render_js=true` (`SCRAPINGBEE_API_KEY`) — defeats Cloudflare Managed Challenge, returns rendered HTML and short-circuits Puppeteer for that page. Costs ~75 ScrapingBee credits (~$0.015) per fallback. If all three fail, surfaces a single friendly error toast + persistent inline alert (no spam).
- **Cloudflare Detector Discipline**: `isCloudflareChallenge()` only matches the interstitial (title `Just a moment...` or `window._cf_chl_opt`). It does NOT treat the bare `cdn-cgi/challenge-platform` script tag as a challenge, because Cloudflare injects that script on real post-challenge pages too — matching it produced false positives that discarded valid HTML.
- **Payment Gating**: Integrates Stripe for secure one-time and subscription-based downloads, with customer lookup for restoring access.

## Product

- **Website Scraping**: Input URL, smart asset extraction (HTML, CSS, JS, images, fonts).
- **Embed Preservation**: Maintains YouTube, Vimeo, Google Maps, Spotify, etc. embeds.
- **Real-time Feedback**: WebSocket-powered progress updates and detailed results summary.
- **Offline Backup**: Downloadable ZIP with organized directory structure for offline use.
- **Monetization**: Gated downloads via Stripe for one-time purchases or monthly subscriptions.
- **Admin Dashboard**: Password-protected `/admin` for usage analytics and Stripe revenue.
- **SEO/Content**: `/blog`, `/features`, `/faq` pages with rich content and SEO optimizations.

## User preferences

_Populate as you build_

## Gotchas

- **Stripe Webhook**: The Stripe webhook handler (`POST /api/stripe/webhook`) must be registered BEFORE `express.json()` middleware in `server/index.ts`.
- **Admin Access**: The admin dashboard at `/admin` requires the `ADMIN_SECRET` environment variable to be set for authentication.
- **Cloudflare**: While `puppeteer-extra-plugin-stealth` helps with Cloudflare challenges, persistent Turnstile challenges will result in a "site protected by Cloudflare" error.
- **Database Resilience**: PostgreSQL connection errors (e.g., Neon sleeping endpoint) are silently retried up to 3 times.
- **Hydration Content Loss**: Wix/React sites can wipe SSR content during hydration; the scraper's hydration-settle wait and rendered-vs-raw content-loss guard in the Puppeteer HTML path prevent saving empty page shells. Asset size cap is 20MB.
- **Contact Info**: The only public contact for the product is hello@websitesucker.com — never expose personal emails/phones anywhere user-facing. (Stripe's public business profile is a separate setting in the Stripe Dashboard.)

## Pointers

- **Stripe Integration**: [Stripe API Documentation](https://stripe.com/docs/api)
- **Puppeteer**: [Puppeteer GitHub Repo](https://github.com/puppeteer/puppeteer)
- **Cheerio**: [Cheerio GitHub Repo](https://github.com/cheeriojs/cheerio)
- **TailwindCSS**: [TailwindCSS Documentation](https://tailwindcss.com/docs)
- **React**: [React Documentation](https://react.dev/)