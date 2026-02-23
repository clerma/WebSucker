# WebSucker - Website Scraper & Offline Backup Tool

## Overview
WebSucker is a web-based alternative to SiteSucker (Mac app) that allows users to download complete websites for offline viewing. Perfect for CMS migrations, website backups, and archiving.

## Features
- **URL Input**: Enter any website URL to start scraping
- **Smart Scraping**: Automatically extracts HTML, CSS, JavaScript, images, fonts, and other assets
- **Embed Preservation**: Keeps YouTube, Vimeo, Google Maps, Spotify, and other embedded content intact
- **Real-time Progress**: WebSocket-powered live updates showing download progress
- **Results Summary**: Detailed breakdown of successful/failed/skipped assets by type
- **ZIP Download**: Organized directory structure that works offline without internet
- **Dark/Light Mode**: Theme toggle for user preference

## Tech Stack
- **Frontend**: React, TypeScript, TailwindCSS, Shadcn/UI, Wouter (routing)
- **Backend**: Express.js, WebSocket (ws), Cheerio (HTML parsing), Archiver (ZIP creation)
- **State**: TanStack Query for data fetching
- **Storage**: In-memory storage for scrape jobs

## Project Structure
```
client/
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── progress-display.tsx    # Real-time scraping progress
│   │   ├── results-summary.tsx     # Post-scrape results view
│   │   ├── url-input-form.tsx      # URL submission form
│   │   ├── theme-provider.tsx      # Theme context
│   │   └── theme-toggle.tsx        # Dark/light toggle
│   ├── pages/
│   │   └── home.tsx      # Main application page
│   └── App.tsx           # Root component with routing
server/
├── routes.ts             # API endpoints + WebSocket
├── scraper.ts            # Core scraping engine
├── storage.ts            # In-memory job storage
└── index.ts              # Express server setup
shared/
└── schema.ts             # Shared TypeScript types
```

## API Endpoints
- `POST /api/scrape` - Start a new scrape job
- `GET /api/scrape/:id` - Get job status
- `GET /api/scrape/:id/download` - Download completed ZIP

## WebSocket
- Path: `/ws`
- Events: `subscribe`, `progress`, `asset`, `complete`, `error`

## Safety Features
- **Asset Limits**: Max 750 assets, 50 HTML pages per scrape
- **SSRF Protection**: Blocks private IP ranges and internal hosts
- **Request Throttling**: 150ms delay between requests
- **Size Limits**: 10MB max per asset
- **Analytics Blocking**: Skips common tracking scripts

## Running Locally
The app runs on port 5000 using `npm run dev` which starts both the Vite dev server and Express backend.

## Recent Changes
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
