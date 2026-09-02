import {
  Link as LinkIcon,
  MonitorPlay,
  ScanLine,
  FileArchive,
  ChevronRight,
  PlayCircle,
  Image as ImageIcon,
  Code2,
  Layers,
  Activity,
  ShieldCheck,
  RefreshCw,
  Smartphone,
  Zap,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { articles } from "@/data/articles";

/* -------------------------------------------------------------------------- */
/* Platform strip — "works with everything" trust signal                       */
/* -------------------------------------------------------------------------- */

const PLATFORMS = [
  "Squarespace",
  "Wix",
  "WordPress",
  "Webflow",
  "Shopify",
  "GoDaddy",
  "Framer",
  "Custom HTML",
];

export function PlatformStrip() {
  return (
    <div className="border-y bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <p className="text-center text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-5">
          Works with every major platform
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {PLATFORMS.map((p) => (
            <span
              key={p}
              className="text-sm sm:text-base font-semibold text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Process flow — the four-step pipeline, as a visual diagram                   */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    icon: LinkIcon,
    title: "Paste a URL",
    body: "Drop in any website address — a whole site or a single page.",
  },
  {
    icon: MonitorPlay,
    title: "We render it",
    body: "A real headless browser loads the page and runs its JavaScript, just like Chrome.",
  },
  {
    icon: ScanLine,
    title: "Capture every asset",
    body: "HTML, CSS, JS, images, fonts, and embeds — scanned and downloaded, links rewritten.",
  },
  {
    icon: FileArchive,
    title: "Download the ZIP",
    body: "One organised archive that opens offline in any browser. No install, ever.",
  },
];

export function ProcessFlow() {
  return (
    <div className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <div className="text-center mb-14 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              From URL to offline backup in one flow
            </h2>
            <p className="text-muted-foreground text-lg">
              No software, no command line, no OS restrictions. Four steps, entirely in your browser.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-4 md:gap-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 110} className="relative">
              <div className="group h-full rounded-2xl border-2 border-border bg-card p-6 text-center transition-colors duration-200 hover:border-primary">
                <div className="relative mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-110">
                  <step.icon className="h-7 w-7 text-primary" />
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mb-2 font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>

              {/* Connector arrow between steps (desktop only) */}
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="absolute top-1/2 -right-3 z-10 hidden -translate-y-1/2 md:flex"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* App preview — a stylised browser window showing a scrape in progress        */
/* -------------------------------------------------------------------------- */

const PREVIEW_ROWS: { type: string; count: string }[] = [
  { type: "HTML", count: "34" },
  { type: "CSS", count: "12" },
  { type: "JS", count: "20" },
  { type: "Images", count: "1,102" },
  { type: "Fonts", count: "8" },
];

export function AppPreview() {
  return (
    <div className="border-t bg-muted/30 py-20 px-4">
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div>
            <span className="ws-label inline-flex items-center gap-1.5 text-primary">
              <Activity className="h-3.5 w-3.5" /> Live progress
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              Watch it work, asset by asset
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              A real-time view of every page and file as it's captured — streamed live over a
              WebSocket. See exactly what your backup contains before you download a thing.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Every asset listed as it's found — nothing hidden",
                "Analyse for free; only pay when you download",
                "Files auto-deleted 10 minutes after scraping",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={140}>
          {/* Ink plate — depth from the plate, not from blur. Mono machine output. */}
          <div className="ws-plate border-2 border-ws-ink p-5 text-[13px]">
            <p className="ws-label mb-4 text-ws-steel">Crawling example.com</p>
            <div className="space-y-1.5">
              {PREVIEW_ROWS.map((row) => (
                <div key={row.type} className="flex items-center justify-between text-ws-mist">
                  <span>{row.type}</span>
                  <span className="tabular-nums">{row.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 mb-2 h-1.5 w-full bg-ws-graphite">
              <div className="h-full bg-ws-cyan" style={{ width: "40%" }} />
            </div>
            <p className="ws-label text-ws-steel">46.2 MB · 40%</p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feature highlights — what makes the capture complete                        */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    icon: PlayCircle,
    title: "Real headless browser",
    body: "Puppeteer-driven Chromium renders JavaScript, lazy-loads, and dynamic content — not just the raw HTML.",
  },
  {
    icon: ImageIcon,
    title: "Images, fonts & media",
    body: "Every image, icon, and font is downloaded and re-linked, including CDN and background images.",
  },
  {
    icon: Code2,
    title: "CSS & JS preserved",
    body: "Stylesheets and scripts come down intact so the offline copy looks and behaves like the original.",
  },
  {
    icon: Layers,
    title: "Embeds kept intact",
    body: "YouTube, Vimeo, Google Maps, Spotify and 25+ providers are preserved so nothing goes blank offline.",
  },
  {
    icon: RefreshCw,
    title: "Auto-resumes on refresh",
    body: "Close the tab or lose connection mid-scrape and it picks right back up where it left off.",
  },
  {
    icon: ShieldCheck,
    title: "Polite & private",
    body: "Rate-limited, respectful crawling. Your scrapes stay private and files are deleted after 10 minutes.",
  },
];

export function FeatureHighlights() {
  return (
    <div className="py-20 px-4">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="mb-14 max-w-2xl text-center mx-auto">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              A complete capture, not a broken snapshot
            </h2>
            <p className="text-lg text-muted-foreground">
              Old tools like wget and HTTrack choke on modern sites. Website Sucker renders the real
              page first, so what you download actually works.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 100}>
              <div className="group h-full rounded-2xl border-2 border-border bg-card p-6 transition-colors duration-200 hover:border-primary">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 transition-transform duration-300 group-hover:scale-110">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-10 text-center">
            <a
              href="/features"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              See all features and how we compare
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Featured guides — surface a few articles from the blog                       */
/* -------------------------------------------------------------------------- */

const FEATURED_SLUGS = [
  "how-to-clone-a-website",
  "how-to-export-your-website-from-squarespace",
  "how-to-backup-your-website",
];

export function FeaturedGuides() {
  const featured = FEATURED_SLUGS.map((slug) => articles.find((a) => a.slug === slug)).filter(
    (a): a is (typeof articles)[number] => Boolean(a)
  );
  if (featured.length === 0) return null;

  return (
    <div className="border-t bg-muted/30 py-20 px-4">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="mb-10 flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Guides to get you started</h2>
              <p className="mt-2 text-muted-foreground">
                Step-by-step help for cloning, exporting, and backing up any site.
              </p>
            </div>
            <a
              href="/blog"
              className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              All guides
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {featured.map((article, i) => (
            <Reveal key={article.slug} delay={i * 110}>
              <a
                href={`/blog/${article.slug}`}
                className="group flex h-full flex-col rounded-2xl border-2 border-border bg-card p-6 transition-colors duration-200 hover:border-primary"
                data-testid={`home-guide-${article.slug}`}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {article.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {article.readingTime}
                  </span>
                </div>
                <h3 className="mb-2 font-semibold leading-snug group-hover:text-primary transition-colors">
                  {article.title}
                </h3>
                <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {article.intro}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read guide
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
