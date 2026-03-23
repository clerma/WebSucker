# Website Sucker - Website Scraper & Offline Backup Tool

## Overview
Website Sucker (websitesucker.com) is a web-based alternative to SiteSucker (Mac app) that allows users to scrape and analyse any website for free, then download the complete offline backup for a small fee. Perfect for CMS migrations, website backups, and archiving.

## Features
- **URL Input**: Enter any website URL to start scraping
- **Smart Scraping**: Automatically extracts HTML, CSS, JavaScript, images, fonts, and other assets
- **Embed Preservation**: Keeps YouTube, Vimeo, Google Maps, Spotify, and other embedded content intact
- **Real-time Progress**: WebSocket-powered live updates showing download progress
- **Results Summary**: Detailed breakdown of successful/failed/skipped assets by type
- **ZIP Download**: Organized directory structure that works offline without internet
- **Dark/Light Mode**: Theme toggle for user preference
- **Payment Gating**: Downloads require payment via Stripe (one-time $1.99 or $5.99/month subscription)

## Tech Stack
- **Frontend**: React, TypeScript, TailwindCSS, Shadcn/UI, Wouter (routing)
- **Backend**: Express.js, WebSocket (ws), Puppeteer (headless browser rendering), Cheerio (HTML parsing), Archiver (ZIP creation)
- **Payments**: Stripe (via Replit integration), stripe-replit-sync for webhook/data sync
- **Database**: PostgreSQL (for Stripe schema sync)
- **State**: TanStack Query for data fetching
- **Storage**: In-memory storage for scrape jobs

## Project Structure
```
client/
├── src/
│   ├── components/
│   │   ├── pricing-dialog.tsx      # Payment plan selection dialog
│   │   ├── progress-display.tsx    # Real-time scraping progress
│   │   ├── results-summary.tsx     # Post-scrape results view
│   │   ├── url-input-form.tsx      # URL submission form
│   │   ├── theme-provider.tsx      # Theme context
│   │   └── theme-toggle.tsx        # Dark/light toggle
│   ├── pages/
│   │   ├── home.tsx                # Main application page
│   │   ├── checkout-success.tsx    # Post-payment success page
│   │   └── checkout-cancel.tsx     # Payment cancelled page
│   └── App.tsx                     # Root component with routing
server/
├── routes.ts             # API endpoints + WebSocket + Stripe routes
├── scraper.ts            # Core scraping engine
├── storage.ts            # In-memory job storage
├── stripeClient.ts       # Stripe SDK client (Replit connector)
├── webhookHandlers.ts    # Stripe webhook processing
├── seed-products.ts      # Script to create Stripe products/prices
└── index.ts              # Express server setup + Stripe init
shared/
└── schema.ts             # Shared TypeScript types
```

## API Endpoints
- `POST /api/scrape` - Start a new scrape job
- `GET /api/scrape/:id` - Get job status
- `GET /api/scrape/:id/download` - Download completed ZIP (requires payment verification)
- `GET /api/stripe/publishable-key` - Get Stripe publishable key
- `GET /api/stripe/prices` - Get available pricing plans
- `POST /api/stripe/checkout` - Create Stripe checkout session
- `GET /api/stripe/verify-payment` - Verify checkout session payment status
- `GET /api/stripe/check-subscription` - Check if customer has active subscription
- `POST /api/stripe/webhook` - Stripe webhook handler (registered before express.json())

## Payment Flow
1. User scrapes a website → sees results summary
2. User clicks "Download ZIP" → pricing dialog shows two options
3. One-time ($1.99): Pay once for this download
4. Monthly ($5.99/mo): Unlimited downloads, cancel anytime
5. User redirected to Stripe Checkout → completes payment
6. Redirected back to /checkout/success → payment verified → download starts
7. Subscribers: customer ID stored in localStorage, future downloads skip pricing dialog

## WebSocket
- Path: `/ws`
- Events: `subscribe`, `progress`, `asset`, `complete`, `error`

## Safety Features
- **Asset Limits**: Max 750 assets, 50 HTML pages per scrape
- **SSRF Protection**: Blocks private IP ranges and internal hosts
- **Request Throttling**: 150ms delay between requests
- **Size Limits**: 10MB max per asset
- **Analytics Blocking**: Skips common tracking scripts

## Stripe Integration
- Uses Replit Stripe connector for credentials
- stripe-replit-sync handles webhook processing and DB sync
- Webhook route registered BEFORE express.json() middleware
- Products created via seed-products.ts script
- Product: "WebSucker" (metadata: app=websucker)
- Prices: $1.99 one-time, $5.99/month subscription

## Running Locally
The app runs on port 5000 using `npm run dev` which starts both the Vite dev server and Express backend.

## Admin Dashboard
- URL: `/admin` (password-protected)
- Password set via `ADMIN_SECRET` environment variable
- Shows: total scrapes, assets scraped, downloads, unique sites, active subscribers, MRR, total revenue
- Recent scrapes list and recent Stripe payments
- Stats are in-memory (reset on server restart) + live Stripe data

## Subscriber Login / Restore Access
- Subscribers can restore access via the pricing dialog: "Already subscribed? Restore access"
- Enter subscription email → server looks up Stripe customer → restores localStorage customerID
- Endpoint: `POST /api/stripe/customer-lookup`

## API Endpoints (additional)
- `POST /api/stripe/customer-lookup` - Find Stripe customer by email (subscription restore)
- `GET /api/admin/stats` - Admin analytics (requires `x-admin-secret` header)

## Recent Changes
- March 2026: 10-minute session expiry — files auto-deleted 10min after scrape; client-side countdown timer shows "Files expire in X:XX"; when timer hits 0 a toast fires and resets to the input view; timer cancelled on download
- March 2026: Admin dashboard at /admin with usage and Stripe revenue analytics
- March 2026: Subscriber email restore - "Already subscribed?" in pricing dialog
- March 2026: Payment gating via Stripe - downloads require one-time payment ($1.99) or monthly subscription ($5.99/mo)
- February 2026: Puppeteer headless browser rendering for HTML pages - captures JS-rendered content (dynamic embeds, lazy-loaded assets, SPA content)
- February 2026: Full-page scrolling to trigger lazy-loaded embeds (500px increments + 5s wait)
- February 2026: Wix `<wix-iframe>` custom elements converted to standard `<iframe>` for offline embed playback
- February 2026: Wix `data-anchor` scroll-to-section links converted to proper `#anchor` hash links with smooth scroll script
- February 2026: Added CSS fixes for Wix `hidden-during-prewarmup` elements and smooth scrolling
- February 2026: Fixed srcset parsing for URLs with commas in paths (Wix image transformations)
- February 2026: Added embed preservation - YouTube, Vimeo, Google Maps, Spotify, and 25+ embed providers are kept intact
- February 2026: Squarespace embed/video blocks with data-html are decoded and activated for offline viewing
- February 2026: Lazy-loaded iframes (data-src) are activated, data-video-url attributes converted to embed iframes
- February 2026: Fixed link rewriting to resolve relative URLs against current page URL (not just base URL)
- February 2026: Fixed meta tag extraction (og:image:width/height values no longer treated as URLs)
- February 2026: Fixed CSS fragment references (#check, %23check) not being mistakenly downloaded
- February 2026: Increased asset limit from 500 to 750 for image-heavy sites
- January 2026: Fixed RSS/XML feed filtering - blog pages no longer display RSS XML content
- January 2026: Improved skip URL detection with specific reasons (analytics vs. feeds)
- January 2026: Content-type validation prevents RSS feeds from being saved as HTML
- January 2026: Initial MVP with full scraping functionality, real-time progress, and ZIP download
