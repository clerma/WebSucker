import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Image as ImageIcon,
  Code,
  PlayCircle,
  Activity,
  Lock,
  ShieldCheck,
  Smartphone,
  Zap,
  Layers,
  Clock,
  Download,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { useSeo } from "@/lib/seo";

interface Feature {
  icon: typeof Globe;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Globe,
    title: "Works on Any Website",
    description:
      "Static sites, modern JavaScript apps, Wix, Squarespace, Shopify, WordPress, React, Vue, Angular, Next.js — if it loads in a browser, we can back it up.",
  },
  {
    icon: PlayCircle,
    title: "Real Headless Browser",
    description:
      "We use a full headless Chrome (Puppeteer) to render every page exactly as a visitor sees it. JavaScript runs, dynamic content appears, lazy images load.",
  },
  {
    icon: ImageIcon,
    title: "Images, Fonts, and Media",
    description:
      "Every <img>, srcset variant, background image inside CSS, font file (TTF/WOFF/WOFF2), favicon, SVG, WebP, and AVIF gets captured.",
  },
  {
    icon: Code,
    title: "CSS and JS Preserved",
    description:
      "All linked stylesheets, @import chains, JavaScript bundles, and inline scripts come along for the ride. The offline copy looks and behaves like the live site.",
  },
  {
    icon: Layers,
    title: "Embeds Kept Intact",
    description:
      "YouTube, Vimeo, Spotify, SoundCloud, Google Maps, Twitter, Instagram, TikTok, Calendly and 25+ other embed providers are preserved and keep working.",
  },
  {
    icon: Activity,
    title: "Live Progress",
    description:
      "Watch every page and asset download in real time over a WebSocket connection. No spinning beach ball, no wondering if it's stuck.",
  },
  {
    icon: Download,
    title: "Single Organised ZIP",
    description:
      "Get one clean ZIP with proper folder structure. Unzip it, double-click index.html, and the entire site opens in any browser — no internet required.",
  },
  {
    icon: RefreshCw,
    title: "Auto-Resumes on Refresh",
    description:
      "If your browser crashes or you accidentally refresh the page, the active scrape resumes automatically. We don't restart from scratch.",
  },
  {
    icon: Smartphone,
    title: "No Install, Any Device",
    description:
      "Runs entirely in your browser on Mac, Windows, Linux, ChromeOS, or mobile. No app to download, no software to maintain.",
  },
  {
    icon: ShieldCheck,
    title: "Polite to Source Sites",
    description:
      "We throttle requests, identify ourselves in the user agent, respect file size limits, and never bypass paywalls or authentication.",
  },
  {
    icon: Lock,
    title: "Privacy by Default",
    description:
      "Your scraped files are auto-deleted from our servers 10 minutes after the scrape completes. We don't keep copies of what you back up.",
  },
  {
    icon: Zap,
    title: "Smart Static Detection",
    description:
      "We detect plain HTML sites and skip the heavy browser for them — making documentation sites and blogs scrape in seconds instead of minutes.",
  },
];

interface CompareRow {
  feature: string;
  websuck: string;
  sitesucker: string;
  httrack: string;
  websitedl: string;
}

const comparison: CompareRow[] = [
  {
    feature: "Renders JavaScript",
    websuck: "Yes (real Chrome)",
    sitesucker: "No",
    httrack: "No",
    websitedl: "Partial",
  },
  {
    feature: "Works on Wix / Squarespace / Shopify",
    websuck: "Yes",
    sitesucker: "Limited",
    httrack: "Limited",
    websitedl: "Limited",
  },
  {
    feature: "Preserves embeds (YouTube, Maps, etc.)",
    websuck: "Yes (25+ providers)",
    sitesucker: "No",
    httrack: "No",
    websitedl: "No",
  },
  {
    feature: "Lazy-loaded images captured",
    websuck: "Yes (auto-scrolls)",
    sitesucker: "No",
    httrack: "No",
    websitedl: "Sometimes",
  },
  {
    feature: "Cross-platform (Win/Mac/Linux)",
    websuck: "Yes (browser)",
    sitesucker: "Mac/iOS only",
    httrack: "Yes",
    websitedl: "Yes",
  },
  {
    feature: "No install required",
    websuck: "Yes",
    sitesucker: "No",
    httrack: "No",
    websitedl: "Yes",
  },
  {
    feature: "Live progress while scraping",
    websuck: "Yes (WebSocket)",
    sitesucker: "Basic",
    httrack: "Basic",
    websitedl: "No",
  },
  {
    feature: "Pricing",
    websuck: "from $1.30 / $5.99 mo",
    sitesucker: "Paid app",
    httrack: "Free",
    websitedl: "Paid past quota",
  },
];

export default function Features() {
  useSeo({
    title: "Features — Website Backup, Archive & Transfer Tools | Website Sucker",
    description:
      "See every Website Sucker feature: real headless-browser rendering, full asset capture, embed preservation, and a one-click offline ZIP. The modern website backup, archive, and transfer tool — compared honestly to SiteSucker, HTTrack, and more.",
    canonicalPath: "/features",
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            data-testid="link-back-home"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Website Sucker
          </a>
          <h1 className="text-4xl font-bold mb-4">
            Everything you need to back up a real website
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Most website downloaders were built for the static web of 2008. Website Sucker was built for today —
            JavaScript-heavy, embed-rich, image-loaded modern sites that other tools choke on.
          </p>
        </div>
      </div>

      {/* Features grid */}
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="border rounded-xl p-6 bg-card hover:border-primary/50 hover:shadow-md transition-all"
                data-testid={`feature-card-${f.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-primary/10 mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison table */}
      <div className="border-t bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-3">How We Compare</h2>
            <p className="text-muted-foreground">
              Honest side-by-side with the most popular alternatives.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border rounded-xl overflow-hidden bg-card text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-4 py-3 font-medium text-primary">Website Sucker</th>
                  <th className="px-4 py-3 font-medium">SiteSucker</th>
                  <th className="px-4 py-3 font-medium">HTTrack</th>
                  <th className="px-4 py-3 font-medium">WebsiteDownloader.io</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.feature} className="border-t">
                    <td className="px-4 py-3 font-medium">{row.feature}</td>
                    <td className="px-4 py-3 text-primary">{row.websuck}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.sitesucker}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.httrack}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.websitedl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pricing summary */}
      <div className="border-t">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-3">Simple, fair pricing</h2>
            <p className="text-muted-foreground">Your first scrape is free to preview. Downloads take a credit.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="border rounded-xl p-8 bg-card">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Credit packs</span>
              </div>
              <div className="text-3xl font-bold mb-1">$4.99</div>
              <p className="text-sm text-muted-foreground mb-5">3 scrape credits — or 10 for $12.99 ($1.30 each).</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />Each credit = one full scrape + ZIP download</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />Credits never expire — no subscription</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />Files held for 10 minutes, then deleted</li>
              </ul>
            </div>
            <div className="border-2 border-primary rounded-xl p-8 bg-card relative">
              <div className="absolute -top-3 left-6 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                Most popular
              </div>
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Monthly</span>
              </div>
              <div className="text-3xl font-bold mb-1">$5.99<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <p className="text-sm text-muted-foreground mb-5">Unlimited downloads. Cancel anytime.</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />Back up as many sites as you like</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />Restore access from any device with your email</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />Pays for itself after 3 downloads</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl font-bold mb-3">Try it on your own site</h2>
          <p className="text-muted-foreground mb-6">
            Preview your first scrape free — no card required.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            data-testid="link-try-now"
          >
            Try Website Sucker Free
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
