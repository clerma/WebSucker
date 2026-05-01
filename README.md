# Website Sucker

A web-based alternative to SiteSucker that lets you scrape and download any website as a complete offline backup — directly from your browser, no Mac app required.

**Live at:** [websitesucker.com](https://websitesucker.com)

---

## What It Does

- Scrapes HTML, CSS, JavaScript, images, fonts, and other assets from any public website
- Handles JavaScript-rendered sites via headless Chromium (Puppeteer)
- Preserves embedded content: YouTube, Vimeo, Google Maps, Spotify, and 25+ other providers
- Shows real-time scraping progress via WebSocket
- Packages everything into a ZIP file with a working offline directory structure
- **Free to analyse** — pay only to download ($1.99 one-time or $5.99/month)
- Admin dashboard with usage analytics, Stripe revenue data, and access code management

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.6 |
| Frontend framework | React 18 |
| Frontend routing | Wouter |
| UI components | shadcn/ui + Radix UI |
| Styling | TailwindCSS 3 |
| Data fetching | TanStack Query v5 |
| Build tool (frontend) | Vite 7 |
| Backend framework | Express 5 |
| WebSocket | ws |
| Headless browser | Puppeteer (Chromium) |
| HTML parsing | Cheerio |
| ZIP packaging | Archiver |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Payments | Stripe |
| Build tool (backend) | esbuild |

---

## System Requirements

### Server / VPS

- **OS:** Linux (Ubuntu 22.04+ recommended)
- **RAM:** 2 GB minimum, 4 GB recommended (Puppeteer is memory-heavy)
- **CPU:** 2 vCPUs minimum
- **Disk:** 10 GB minimum (scraped ZIPs are temporary but can be large)
- **Node.js:** v20 or later
- **npm:** v10 or later

### System Dependencies

Puppeteer requires a Chromium installation and several system libraries. On Ubuntu/Debian:

```bash
apt-get update && apt-get install -y \
  chromium-browser \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  fonts-liberation \
  ca-certificates
```

Alternatively, let Puppeteer download its own bundled Chromium (handled automatically on `npm install`).

### Database

- **PostgreSQL 14+** — required for Stripe webhook/subscription sync via `stripe-replit-sync`

---

## Environment Variables

Create a `.env` file in the project root (or set these as system environment variables):

```env
# ─── Required ─────────────────────────────────────────────────

# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/websitesucker

# Stripe API keys (live keys for production, test keys for development)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Admin dashboard password — set something strong
ADMIN_SECRET=your-secure-admin-password

# ─── Optional ─────────────────────────────────────────────────

# Session secret for express-session (generate a random string)
SESSION_SECRET=some-random-secret-string

# Port to listen on (defaults to 5000)
PORT=5000

# Your public domain — used for Stripe webhook registration
# Must be publicly accessible (not localhost) for webhooks to work
REPLIT_DOMAINS=yourdomain.com
```

> **Note:** `REPLIT_DOMAINS` is used to auto-register the Stripe webhook endpoint. On Replit this is set automatically. On other servers, set it to your public domain so the webhook URL is registered correctly with Stripe.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/youruser/website-sucker.git
cd website-sucker
```

### 2. Install Node.js dependencies

```bash
npm install
```

This also downloads a bundled Chromium for Puppeteer unless you configure it to use a system Chromium.

### 3. Set up PostgreSQL

Create the database:

```bash
createdb websitesucker
```

Then set `DATABASE_URL` in your environment and push the schema:

```bash
npx drizzle-kit push
```

### 4. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env
# Edit .env with your editor
```

### 5. Create Stripe products

Run this once to create the pricing products in your Stripe account:

```bash
npx tsx server/seed-products.ts
```

This creates:
- **Website Sucker** product with two prices:
  - $1.99 one-time download
  - $5.99/month subscription

---

## Running in Development

```bash
npm run dev
```

This starts the Express backend and Vite dev server together on port 5000 using `tsx` for TypeScript execution.

---

## Building for Production

```bash
npm run build
```

This runs two steps:
1. **Frontend:** Vite bundles the React app into `dist/public/`
2. **Backend:** esbuild bundles the Express server into `dist/index.cjs`

---

## Running in Production

```bash
npm start
```

This runs `NODE_ENV=production node dist/index.cjs`, which:
- Serves the built React frontend as static files
- Runs the Express API server
- Registers the Stripe webhook automatically on startup

### Recommended: Run with a process manager

Use PM2 to keep the app running and restart it on crash:

```bash
npm install -g pm2
pm2 start dist/index.cjs --name website-sucker
pm2 save
pm2 startup
```

### Recommended: Reverse proxy with Nginx

Put Nginx in front of the Node server for TLS termination:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Needed for WebSocket (real-time scraping progress)
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

Get a free TLS certificate with Certbot:

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

---

## Stripe Webhook Setup

The app auto-registers its webhook with Stripe on startup using the `REPLIT_DOMAINS` environment variable. If you prefer to register manually:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://yourdomain.com/api/stripe/webhook`
3. Select all events (or at minimum: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`)

The webhook secret is managed automatically by `stripe-replit-sync`.

---

## Using a System Chromium (Optional)

If you want Puppeteer to use the system Chromium instead of downloading its own:

```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

Add these to your `.env` before running `npm install`.

---

## Project Structure

```
client/                     # React frontend
├── public/                 # Static assets (favicons, manifest, robots.txt, sitemap.xml)
└── src/
    ├── components/
    │   ├── pricing-dialog.tsx    # Payment + access code dialog
    │   ├── progress-display.tsx  # Real-time scraping progress
    │   ├── results-summary.tsx   # Post-scrape results
    │   └── url-input-form.tsx    # URL submission form
    └── pages/
        ├── home.tsx              # Main app page
        ├── admin.tsx             # Admin dashboard
        ├── checkout-success.tsx  # Post-payment landing
        └── checkout-cancel.tsx   # Payment cancelled

server/
├── index.ts              # Express server entry point
├── routes.ts             # All API routes + WebSocket
├── scraper.ts            # Core scraping engine (Puppeteer + Cheerio)
├── storage.ts            # In-memory job + access code storage
├── stripeClient.ts       # Stripe SDK client
├── webhookHandlers.ts    # Stripe webhook processing
├── seed-products.ts      # One-time Stripe product setup script
└── static.ts             # Production static file serving

shared/
└── schema.ts             # Shared TypeScript types

script/
└── build.ts              # esbuild + Vite production build script
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scrape` | Start a scrape job |
| `GET` | `/api/scrape/:id` | Get job status |
| `GET` | `/api/scrape/:id/download` | Download ZIP (requires payment) |
| `GET` | `/api/stripe/publishable-key` | Get Stripe publishable key |
| `GET` | `/api/stripe/prices` | Get pricing options |
| `POST` | `/api/stripe/checkout` | Create Stripe checkout session |
| `GET` | `/api/stripe/verify-payment` | Verify payment after redirect |
| `GET` | `/api/stripe/check-subscription` | Check subscriber status |
| `POST` | `/api/stripe/customer-lookup` | Restore subscriber access by email |
| `POST` | `/api/stripe/webhook` | Stripe webhook receiver |
| `POST` | `/api/access-code/redeem` | Redeem an access code for a download |
| `GET` | `/api/admin/stats` | Admin analytics (requires `x-admin-secret` header) |
| `GET` | `/api/admin/access-codes` | List access codes (admin) |
| `POST` | `/api/admin/access-codes` | Generate an access code (admin) |
| `DELETE` | `/api/admin/access-codes/:code` | Delete an access code (admin) |

WebSocket path: `/ws`

---

## Admin Dashboard

Accessible at `/admin`. Login with the password set in `ADMIN_SECRET`.

Shows:
- Total scrapes, assets, downloads, and unique sites (in-memory, resets on restart)
- Active subscribers, MRR, and total revenue (live from Stripe)
- Recent scrape history and recent payments
- Access code management: generate, copy, and revoke codes

> **Note:** Usage analytics (scrapes, downloads) are stored in memory and will reset when the server restarts. Stripe revenue data is always live. For persistent analytics, a database-backed analytics store would need to be added.

---

## Access Codes

Admins can generate access codes from the dashboard to grant free download access:

- **Unlimited codes** — can be reused any number of times (good for personal use)
- **Single/limited-use codes** — expire after N uses (good for gifting access)

Users enter codes in the pricing dialog via "Have an access code?" — no payment required.

> Access codes are stored in memory and reset on server restart. Plan accordingly for production use.

---

## Safety Features

- **SSRF protection:** Blocks private IP ranges (10.x, 192.168.x, 127.x, etc.)
- **Asset limits:** Max 750 assets and 50 HTML pages per scrape
- **Request throttling:** 150ms delay between requests
- **Size limits:** 10 MB max per asset
- **Analytics blocking:** Skips common tracking scripts automatically

---

## Deploying with Docker

A minimal Dockerfile for containerised deployment:

```dockerfile
FROM node:20-slim

# Install Chromium system dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
    libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libxcomposite1 libxdamage1 libxfixes3 \
    libxkbcommon0 libxrandr2 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

EXPOSE 5000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t website-sucker .
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://... \
  -e STRIPE_SECRET_KEY=sk_live_... \
  -e STRIPE_PUBLISHABLE_KEY=pk_live_... \
  -e ADMIN_SECRET=yourpassword \
  -e REPLIT_DOMAINS=yourdomain.com \
  website-sucker
```

---

## License

MIT
