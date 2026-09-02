import { useLocation } from "wouter";
import {
  ArrowRight,
  FileArchive,
  Globe,
  Link2,
  MonitorSmartphone,
  Copy,
  KeyRound,
  ShieldCheck,
  Radar,
  FolderTree,
  WifiOff,
  Gauge,
  History,
  FileCode2,
  type LucideIcon,
} from "lucide-react";
import type { LandingIcon } from "@/data/landing-pages";
import { WsLogo } from "@/components/logo";
import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { UrlInputForm } from "@/components/url-input-form";
import { CrawlPanel } from "@/components/crawl-panel";
import { HowItWorks, CtaBand, SiteFooter } from "@/components/landing";
import { Reveal } from "@/components/reveal";
import { useSeo, softwareApplicationSchema, SITE_URL } from "@/lib/seo";
import { getLandingPage } from "@/data/landing-pages";
import NotFound from "@/pages/not-found";
import type { StartScrapeInput } from "@shared/schema";

const ICONS: Record<LandingIcon, LucideIcon> = {
  zip: FileArchive,
  render: Globe,
  link: Link2,
  device: MonitorSmartphone,
  copy: Copy,
  own: KeyRound,
  shield: ShieldCheck,
  crawl: Radar,
  folder: FolderTree,
  offline: WifiOff,
  gauge: Gauge,
  backup: History,
  reference: FileCode2,
};

// A small, on-brand "what lands in the ZIP" visual for the intro section.
const ZIP_TREE: [string, string][] = [
  ["index.html", "pages"],
  ["/assets/css/", "styles"],
  ["/assets/js/", "scripts"],
  ["/img/", "images"],
  ["/fonts/", "fonts"],
  ["manifest.json", "report"],
];

/**
 * Data-driven keyword landing page. Content comes from
 * client/src/data/landing-pages.ts, keyed by `slug` (routed in App.tsx).
 * The URL input hands off to the home hero via a `?url=` param, where the
 * normal scrape flow (including the free-account gate) takes over — this page
 * never posts to the API itself, so the working scrape path is untouched.
 */
export default function LandingPage({ slug }: { slug: string }) {
  const page = getLandingPage(slug);
  const [, navigate] = useLocation();

  useSeo(
    page
      ? {
          title: page.metaTitle,
          description: page.metaDescription,
          canonicalPath: `/${page.slug}`,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: page.faq.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: page.eyebrow, item: `${SITE_URL}/${page.slug}` },
              ],
            },
            softwareApplicationSchema,
          ],
        }
      : { title: "Not found | Website Sucker", noIndex: true }
  );

  // Hand the URL off to the home hero, which runs the real scrape flow.
  const handleUrl = (data: StartScrapeInput) => {
    navigate(`/?url=${encodeURIComponent(data.url)}`);
  };

  if (!page) return <NotFound />;

  return (
    <div className="min-h-screen bg-ws-paper">
      {/* Dark hero */}
      <div className="relative overflow-hidden bg-ws-ink text-ws-paper">
        <div aria-hidden className="ws-hero-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-48 -left-40 h-[38rem] w-[38rem] rounded-full bg-primary/25 blur-[130px]"
        />

        <header className="relative z-10 border-b border-ws-graphite">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-8">
              <a href="/" aria-label="WebsiteSucker home">
                <WsLogo markClassName="h-6 w-auto" invert />
              </a>
              <nav className="hidden items-center gap-8 md:flex">
                <a href="/#how" className="text-sm text-ws-mist transition-colors hover:text-ws-paper">How it works</a>
                <a href="/#pricing" className="text-sm text-ws-mist transition-colors hover:text-ws-paper">Pricing</a>
                <a href="/faq" className="text-sm text-ws-mist transition-colors hover:text-ws-paper">FAQ</a>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <AccountMenu onDark />
              <ThemeToggle onDark />
            </div>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
          <div className="animate-fade-up">
            <p className="ws-label mb-5 inline-block border border-ws-graphite px-2.5 py-1 text-ws-steel">
              {page.eyebrow}
            </p>
            <h1 className="mb-5 text-[2.5rem] font-extrabold leading-[0.98] tracking-tight sm:text-5xl">
              {page.h1}
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-ws-mist">{page.subhead}</p>

            <UrlInputForm onSubmit={handleUrl} isLoading={false} tone="dark" />

            <p className="ws-label mt-4 text-ws-steel">
              Free analysis · First scrape free · No install
            </p>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
            <CrawlPanel />
          </div>
        </div>
      </div>

      {/* Intro prose + ZIP visual */}
      <section className="bg-ws-paper text-ws-ink py-20 px-4">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <Reveal>
            <div className="space-y-5">
              {page.intro.map((para, i) => (
                <p key={i} className="text-lg leading-relaxed text-ws-steel">{para}</p>
              ))}
            </div>
          </Reveal>

          {/* Dark "inside the ZIP" plate */}
          <Reveal delay={120}>
            <div className="ws-plate border-2 border-ws-graphite bg-ws-ink text-ws-paper">
              <div className="h-0.5 w-full bg-ws-cyan" />
              <div className="flex items-center justify-between border-b border-ws-graphite px-4 py-2.5">
                <span className="ws-label text-ws-steel">site.zip</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ws-cyan">
                  <FileArchive className="h-3.5 w-3.5" /> ready
                </span>
              </div>
              <div className="p-2">
                {ZIP_TREE.map(([name, meta]) => (
                  <div key={name} className="flex items-center justify-between px-3 py-2 font-mono text-sm">
                    <span className="text-ws-mist">{name}</span>
                    <span className="ws-label text-ws-steel">{meta}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-ws-graphite px-4 py-3 font-mono text-xs text-ws-steel">
                Unzip → opens offline in any browser
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Benefit bullets */}
      <section className="bg-ws-paper text-ws-ink pb-20 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-0 border-2 border-ws-ink sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-ws-ink [&>*+*]:border-t-2 sm:[&>*+*]:border-t-0 sm:[&>*:nth-child(n+3)]:border-t-2 lg:[&>*:nth-child(n+3)]:border-t-0 sm:[&>*:nth-child(2n)]:border-l-2 lg:[&>*+*]:border-l-2">
            {page.bullets.map((b, i) => {
              const Icon = ICONS[b.icon];
              return (
                <Reveal key={b.title} delay={i * 90}>
                  <div className="h-full p-7">
                    <span className="mb-5 inline-flex h-11 w-11 items-center justify-center border-2 border-ws-ink text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mb-2 text-lg font-bold tracking-tight">{b.title}</h3>
                    <p className="text-[15px] leading-relaxed text-ws-steel">{b.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison table (alternative pages) */}
      {page.comparison && (
        <section className="bg-ws-paper text-ws-ink pb-20 px-4">
          <div className="mx-auto max-w-4xl">
            <Reveal>
              <h2 className="mb-8 text-2xl font-extrabold tracking-tight sm:text-3xl">
                {page.comparison.heading}
              </h2>
              <div className="overflow-x-auto border-2 border-ws-ink">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-ws-ink">
                      <th className="ws-label p-4 text-ws-steel">Feature</th>
                      <th className="p-4 font-bold text-primary">{page.comparison.columns[0]}</th>
                      <th className="ws-label p-4 text-ws-steel">{page.comparison.columns[1]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.comparison.rows.map((r) => (
                      <tr key={r.feature} className="border-t border-ws-ink/10">
                        <td className="p-4 font-semibold">{r.feature}</td>
                        <td className="p-4 text-ws-ink">{r.us}</td>
                        <td className="p-4 text-ws-steel">{r.them}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* Shared how-it-works */}
      <HowItWorks />

      {/* FAQ */}
      <section className="bg-ws-paper text-ws-ink py-20 px-4">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <p className="ws-label mb-3 text-primary">FAQ</p>
            <h2 className="mb-12 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Questions, answered.
            </h2>
          </Reveal>
          <div className="divide-y-2 divide-ws-ink border-y-2 border-ws-ink">
            {page.faq.map((f) => (
              <Reveal key={f.q}>
                <div className="py-6">
                  <h3 className="mb-2 text-lg font-bold tracking-tight">{f.q}</h3>
                  <p className="text-[15px] leading-relaxed text-ws-steel">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Related landing pages */}
      <section className="bg-ws-paper text-ws-ink pb-20 px-4">
        <div className="mx-auto max-w-6xl">
          <p className="ws-label mb-6 text-ws-steel">Related</p>
          <div className="flex flex-wrap gap-3">
            {page.related.map((rslug) => {
              const rp = getLandingPage(rslug);
              if (!rp) return null;
              return (
                <a
                  key={rslug}
                  href={`/${rslug}`}
                  className="inline-flex items-center gap-2 border-2 border-ws-ink px-4 py-2 text-sm font-semibold transition-colors hover:bg-ws-ink hover:text-ws-paper"
                >
                  {rp.eyebrow}
                  <ArrowRight className="h-4 w-4" />
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <CtaBand onStart={() => navigate("/")} />
      <SiteFooter />
    </div>
  );
}
