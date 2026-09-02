import {
  Check,
  ClipboardPaste,
  ScanLine,
  FileArchive,
  Globe,
  Images,
  Film,
  Link2,
  Eye,
  ShieldCheck,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/reveal";

/* -------------------------------------------------------------------------- */
/* Platform strip — dark bar, mono uppercase                                   */
/* -------------------------------------------------------------------------- */

const PLATFORMS = [
  "WordPress",
  "Squarespace",
  "Wix",
  "Webflow",
  "Shopify",
  "Ghost",
  "Hand-built HTML",
  "Next.js",
  "React SPAs",
];

export function PlatformStrip() {
  // Two copies of the row so the -50% marquee loops seamlessly.
  const row = [...PLATFORMS, ...PLATFORMS];
  return (
    <div className="bg-ws-ink border-b-2 border-ws-graphite overflow-hidden py-4">
      <div className="ws-marquee flex w-max items-center">
        {row.map((p, i) => (
          <span key={i} className="flex items-center">
            <span className="ws-label px-6 text-ws-steel">{p}</span>
            <span aria-hidden className="text-ws-graphite">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 01 — How it works                                                           */
/* -------------------------------------------------------------------------- */

const STEPS: { n: string; title: string; body: string; icon: LucideIcon }[] = [
  {
    n: "01",
    title: "Paste the URL",
    body: "Drop in any address — a whole site or a single page. No account needed to start.",
    icon: ClipboardPaste,
  },
  {
    n: "02",
    title: "Watch the crawl",
    body: "A real browser renders every page and pulls each asset, live, as it finds them.",
    icon: ScanLine,
  },
  {
    n: "03",
    title: "Take the ZIP",
    body: "One organised archive that opens offline in any browser. Pay only if you keep it.",
    icon: FileArchive,
  },
];

export function HowItWorks() {
  return (
    <section className="bg-ws-paper text-ws-ink py-20 px-4">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="ws-label mb-3 text-primary">01 — How it works</p>
          <h2 className="mb-14 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Three steps. No install, no terminal.
          </h2>
        </Reveal>
        <div className="grid gap-0 border-2 border-ws-ink md:grid-cols-3 md:[&>*+*]:border-l-2 md:[&>*+*]:border-ws-ink [&>*+*]:border-t-2 md:[&>*+*]:border-t-0 [&>*+*]:border-ws-ink">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110}>
              <div className="h-full p-7">
                <div className="mb-6 flex items-center justify-between">
                  <div className="ws-label text-ws-steel">Step {s.n}</div>
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-bold tracking-tight">{s.title}</h3>
                <p className="text-[15px] leading-relaxed text-ws-steel">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 02 — What you get                                                           */
/* -------------------------------------------------------------------------- */

const HEADLINE_STATS: [string, string][] = [
  ["1,200+", "Assets, typical site"],
  ["42 MB", "Average ZIP"],
  ["~2 min", "Median run time"],
  ["$1.99", "Per download"],
];

const ZIP_TREE: [string, string][] = [
  ["index.html", "34 pages"],
  ["/assets/css/", "12 files"],
  ["/assets/js/", "28 files"],
  ["/img/", "1,102 files"],
  ["/fonts/", "8 files"],
  ["manifest.json", "crawl report"],
];

const HANDLED: { n: string; title: string; body: string; icon: LucideIcon }[] = [
  { n: "01", title: "JavaScript-rendered pages", body: "React, Vue and Wix sites render fully before capture.", icon: Globe },
  { n: "02", title: "Lazy-loaded media", body: "Images and fonts that only load on scroll are pulled in.", icon: Images },
  { n: "03", title: "Embeds preserved", body: "YouTube, Vimeo, Maps and 25+ providers stay intact offline.", icon: Film },
  { n: "04", title: "Links rewritten", body: "Every internal link points at local files, so it just works.", icon: Link2 },
];

export function WhatYouGet() {
  return (
    <section className="ws-plate bg-ws-ink text-ws-paper py-20 px-4" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="ws-label mb-3 text-ws-cyan">02 — What you get</p>
          <h2 className="mb-14 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            A folder that behaves exactly like the live site.
          </h2>
        </Reveal>

        {/* headline stats */}
        <Reveal>
          <div className="grid grid-cols-2 divide-ws-graphite border-2 border-ws-graphite md:grid-cols-4 md:divide-x-2">
            {HEADLINE_STATS.map(([value, label]) => (
              <div key={label} className="border-t-2 border-ws-graphite p-5 md:border-t-0 [&:nth-child(-n+2)]:border-t-0 md:[&:nth-child(2)]:border-l-2">
                <div className="font-mono text-2xl font-bold tabular-nums text-ws-paper">{value}</div>
                <div className="ws-label mt-1 text-ws-steel">{label}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* inside the zip */}
          <Reveal>
            <div className="h-full border-2 border-ws-graphite">
              <div className="ws-label border-b border-ws-graphite px-5 py-3 text-ws-steel">Inside the ZIP</div>
              <div className="p-2">
                {ZIP_TREE.map(([name, meta]) => (
                  <div key={name} className="flex items-center justify-between px-3 py-2 font-mono text-sm">
                    <span className="text-ws-mist">{name}</span>
                    <span className="text-ws-steel">{meta}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* handled for you */}
          <Reveal delay={120}>
            <div className="h-full border-2 border-ws-graphite">
              <div className="ws-label border-b border-ws-graphite px-5 py-3 text-ws-steel">Handled for you</div>
              <div className="divide-y divide-ws-graphite">
                {HANDLED.map((h) => (
                  <div key={h.n} className="flex gap-4 px-5 py-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-ws-graphite text-ws-cyan">
                      <h.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold tracking-tight">{h.title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-ws-steel">{h.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 03 — Proof / credibility                                                    */
/* -------------------------------------------------------------------------- */

// Truthful trust pillars — every claim here is backed by the FAQ / product.
const PILLARS: { n: string; title: string; body: string; icon: LucideIcon }[] = [
  {
    n: "01",
    title: "Try before you pay",
    body: "Your first scrape is free and every analysis is free — see the full asset inventory and size before a single credit is spent.",
    icon: Eye,
  },
  {
    n: "02",
    title: "Your files, then gone",
    body: "Scraped files are auto-deleted 10 minutes after the run completes. We never keep copies, share them, or reuse them.",
    icon: ShieldCheck,
  },
  {
    n: "03",
    title: "Real-browser fidelity",
    body: "A full headless browser renders JavaScript-heavy sites — Wix, Squarespace, React — before capture, so the copy matches the live page.",
    icon: Globe,
  },
  {
    n: "04",
    title: "No lock-in",
    body: "Credits never expire and the unlimited plan cancels anytime — no minimum term, no cancellation fee.",
    icon: Unlock,
  },
];

/**
 * PLACEHOLDER testimonials. Replace `quote` / `name` / `role` with real,
 * permissioned customer quotes before relying on this as social proof —
 * do not ship fabricated reviews. When the list is empty the block is
 * hidden automatically, and no rating/review schema is emitted anywhere.
 */
const TESTIMONIALS: { quote: string; name: string; role: string }[] = [
  // {
  //   quote: "Pasted a Squarespace URL and had the whole site as a clean ZIP in two minutes.",
  //   name: "Real Customer Name",
  //   role: "Freelance developer",
  // },
];

export function Credibility() {
  return (
    <section className="bg-ws-paper text-ws-ink py-20 px-4">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="ws-label mb-3 text-primary">03 — Why people trust it</p>
          <h2 className="mb-14 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Low risk by design.
          </h2>
        </Reveal>

        <div className="grid gap-0 border-2 border-ws-ink sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-ws-ink [&>*+*]:border-t-2 sm:[&>*+*]:border-t-0 sm:[&>*:nth-child(n+3)]:border-t-2 lg:[&>*:nth-child(n+3)]:border-t-0 sm:[&>*:nth-child(2n)]:border-l-2 lg:[&>*+*]:border-l-2">
          {PILLARS.map((p, i) => (
            <Reveal key={p.n} delay={i * 90}>
              <div className="h-full p-7">
                <span className="mb-5 inline-flex h-11 w-11 items-center justify-center border-2 border-ws-ink text-primary">
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="mb-2 text-lg font-bold tracking-tight">{p.title}</h3>
                <p className="text-[15px] leading-relaxed text-ws-steel">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {TESTIMONIALS.length > 0 && (
          <div className="mt-6 grid gap-0 border-2 border-ws-ink md:grid-cols-2 lg:grid-cols-3 [&>*+*]:border-t-2 md:[&>*+*]:border-t-0 md:[&>*:nth-child(n+3)]:border-t-2 lg:[&>*:nth-child(n+3)]:border-t-0 md:[&>*:nth-child(2n)]:border-l-2 lg:[&>*:nth-child(3n+2)]:border-l-2 lg:[&>*:nth-child(3n)]:border-l-2">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 90}>
                <figure className="h-full p-7">
                  <blockquote className="text-[15px] leading-relaxed text-ws-ink">"{t.quote}"</blockquote>
                  <figcaption className="mt-4">
                    <div className="text-sm font-semibold tracking-tight">{t.name}</div>
                    <div className="ws-label mt-0.5 text-ws-steel">{t.role}</div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 04 — Pricing                                                                */
/* -------------------------------------------------------------------------- */

const TIERS = [
  {
    label: "Analysis",
    price: "Free",
    unit: "",
    body: "Full inventory and size estimate before you commit. Analyse as many sites as you like.",
    features: ["Every asset listed", "Total size estimate", "No card required"],
    highlight: false,
    badge: "",
  },
  {
    label: "Credits",
    price: "$1.99",
    unit: "/ scrape",
    body: "One credit = one full scrape and download. Buy in packs — credits never expire.",
    features: ["3 credits — $4.99 ($1.66 each)", "10 credits — $12.99 ($1.30 each)", "No subscription"],
    highlight: false,
    badge: "",
  },
  {
    label: "Unlimited Monthly",
    price: "$5.99",
    unit: "/ month",
    body: "Unlimited scrapes and downloads. Cancel anytime.",
    features: ["Unlimited scrapes", "Unlimited downloads", "Cancel anytime"],
    highlight: true,
    badge: "Best value",
  },
];

export function Pricing({ onStart }: { onStart?: () => void }) {
  return (
    <section className="bg-ws-paper text-ws-ink py-20 px-4">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="ws-label mb-3 text-primary">04 — Pricing</p>
          <h2 className="mb-14 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Analyse for free. Pay per ZIP.
          </h2>
        </Reveal>
        <div className="grid gap-0 border-2 border-ws-ink md:grid-cols-3 md:[&>*+*]:border-l-2 md:[&>*+*]:border-ws-ink [&>*+*]:border-t-2 md:[&>*+*]:border-t-0 [&>*+*]:border-ws-ink">
          {TIERS.map((t, i) => (
            <Reveal key={t.label} delay={i * 110}>
              <div className={t.highlight ? "h-full bg-ws-ink p-7 text-ws-paper" : "h-full p-7"}>
                <div className="mb-6 flex items-center justify-between gap-2">
                  <span className={`ws-label ${t.highlight ? "text-ws-cyan" : "text-ws-steel"}`}>{t.label}</span>
                  {t.badge && (
                    <span className="bg-primary px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-primary-foreground">
                      {t.badge}
                    </span>
                  )}
                </div>
                <div className="mb-4 flex items-end gap-1.5">
                  <span className="font-mono text-4xl font-bold tracking-tight">{t.price}</span>
                  {t.unit && (
                    <span className={`mb-1 font-mono text-sm ${t.highlight ? "text-ws-steel" : "text-ws-steel"}`}>
                      {t.unit}
                    </span>
                  )}
                </div>
                <p className={`mb-6 text-sm leading-relaxed ${t.highlight ? "text-ws-mist" : "text-ws-steel"}`}>
                  {t.body}
                </p>
                <ul className="space-y-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${t.highlight ? "text-ws-cyan" : "text-primary"}`} />
                      <span className={t.highlight ? "text-ws-mist" : "text-ws-steel"}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="mt-8">
            <button
              onClick={onStart}
              className="bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-ws-accent-pressed"
              data-testid="button-pricing-start"
            >
              Start free analysis
            </button>
            <p className="ws-label mt-4 text-ws-steel">
              Only download sites you own or have permission to copy.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Blue CTA band                                                               */
/* -------------------------------------------------------------------------- */

export function CtaBand({ onStart }: { onStart?: () => void }) {
  return (
    <section className="bg-primary text-primary-foreground py-20 px-4">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <h2 className="max-w-2xl text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Suck a site dry in about two minutes.
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={onStart}
            className="border-2 border-primary-foreground bg-primary-foreground px-6 py-3 text-base font-semibold text-primary transition-opacity hover:opacity-90"
            data-testid="button-cta-start"
          >
            Paste a URL
          </button>
          <a
            href="/features"
            className="border-2 border-primary-foreground/50 px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:border-primary-foreground"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                       */
/* -------------------------------------------------------------------------- */

export function SiteFooter() {
  return (
    <footer className="bg-ws-ink text-ws-steel py-8 px-4">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="ws-label">WebsiteSucker © 2026</span>
        <div className="flex items-center gap-6">
          <a href="/blog" className="ws-label transition-colors hover:text-ws-paper">Docs</a>
          <a href="/faq" className="ws-label transition-colors hover:text-ws-paper">FAQ</a>
          <a href="/terms" className="ws-label transition-colors hover:text-ws-paper">Terms</a>
        </div>
      </div>
    </footer>
  );
}
