# WebSucker - Website Scraper & Offline Backup Tool

## Overview
WebSucker is a web-based alternative to SiteSucker (Mac app) that allows users to download complete websites for offline viewing. Perfect for CMS migrations, website backups, and archiving.

## Features
- **URL Input**: Enter any website URL to start scraping
- **Smart Scraping**: Automatically extracts HTML, CSS, JavaScript, images, fonts, and other assets
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
- **Asset Limits**: Max 500 assets, 50 HTML pages per scrape
- **SSRF Protection**: Blocks private IP ranges and internal hosts
- **Request Throttling**: 150ms delay between requests
- **Size Limits**: 10MB max per asset
- **Analytics Blocking**: Skips common tracking scripts

## Running Locally
The app runs on port 5000 using `npm run dev` which starts both the Vite dev server and Express backend.

## Recent Changes
- January 2026: Initial MVP with full scraping functionality, real-time progress, and ZIP download
