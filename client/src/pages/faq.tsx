import { ArrowLeft, ArrowRight, HelpCircle } from "lucide-react";
import { useSeo } from "@/lib/seo";

interface QA {
  q: string;
  a: string[];
}

const faqs: QA[] = [
  {
    q: "What is Website Sucker?",
    a: [
      "Website Sucker is a browser-based tool that downloads any public website as a single ZIP file. The ZIP contains every page, image, stylesheet, JavaScript file, font, and embedded element — organised so it opens offline in any browser. There's nothing to install.",
    ],
  },
  {
    q: "How is this different from SiteSucker?",
    a: [
      "SiteSucker is a Mac/iOS app that's been around for years. Website Sucker is a web app — works in any browser on Mac, Windows, Linux, ChromeOS, or mobile. The bigger difference: Website Sucker uses a real headless Chrome browser to render JavaScript-heavy sites (Wix, Squarespace, Shopify, React, etc.), so the download actually looks like the live site. SiteSucker doesn't run JavaScript and often misses content on modern sites.",
    ],
  },
  {
    q: "Is it free?",
    a: [
      "Analysing any website is completely free — you can see exactly what would be downloaded before paying anything. The actual ZIP download costs $1.99 one-time, or $5.99/month for unlimited downloads (cancel anytime).",
    ],
  },
  {
    q: "What's included in the download?",
    a: [
      "Every HTML page, every image (including lazy-loaded ones), every stylesheet, every JavaScript file, all custom fonts, favicons, and modern formats like WebP/AVIF/SVG. Embedded YouTube videos, Vimeo, Google Maps, Spotify, SoundCloud, and 25+ other embed providers are preserved as live embeds. Open index.html in any browser and the site works offline (videos and maps need internet, everything else is local).",
    ],
  },
  {
    q: "What about JavaScript-heavy sites like Wix or Squarespace?",
    a: [
      "Those are exactly the sites we built this for. Most older downloaders fail on Wix and Squarespace because they don't run JavaScript. Website Sucker uses a real Chrome browser behind the scenes, scrolls each page to trigger lazy-loaded images, deduplicates Wix/Squarespace CDN variants, and converts custom elements (like <wix-iframe>) into standard iframes that work offline.",
    ],
  },
  {
    q: "How big a site can I download?",
    a: [
      "Each scrape captures up to 50 HTML pages and 750 total assets (images, CSS, JS, fonts, etc.) per session. That covers the vast majority of small business and personal sites. Very large sites (a 5,000-page documentation portal) would need multiple scrapes targeted at different sections.",
    ],
  },
  {
    q: "Is this legal?",
    a: [
      "Downloading a publicly-accessible website for personal use, backup, archival, or migration is generally legal and ethical. Republishing someone else's content, cloning their design, or bypassing paywalls is not. We've written a plain-English guide on this in the blog — see 'Is It Legal to Download a Website?'",
    ],
  },
  {
    q: "Can I download password-protected or paywalled sites?",
    a: [
      "No. Website Sucker only downloads publicly-accessible content. We don't bypass logins, paywalls, or authentication. If you want to back up your own site that's behind a login, you'll need to either temporarily make it public or use a tool that supports authenticated crawls.",
    ],
  },
  {
    q: "What about adult or NSFW content?",
    a: [
      "Adult websites are blocked at the URL level. We don't process or store anything from adult domains.",
    ],
  },
  {
    q: "Where are my files stored?",
    a: [
      "Your scraped files live on our server temporarily so you can download them. They're automatically deleted 10 minutes after the scrape completes. We don't keep copies, we don't share them, and they're never used for anything else.",
    ],
  },
  {
    q: "Why do I need to pay to download but not to scrape?",
    a: [
      "Running a real headless browser, downloading hundreds of assets per site, and serving the results uses real bandwidth and compute. We let you analyse for free so you can verify the result is what you want before paying. The download fee covers the infrastructure and keeps the service sustainable.",
    ],
  },
  {
    q: "What's the difference between $1.99 and $5.99/month?",
    a: [
      "$1.99 is a one-time charge for a single download — perfect if you just need to back up one site. $5.99/month gives you unlimited downloads — better if you'll be backing up multiple sites or doing periodic backups of the same site. The subscription pays for itself after about three downloads.",
    ],
  },
  {
    q: "I subscribed — how do I get my access back on a different device?",
    a: [
      "On the pricing dialog, click 'Already subscribed? Restore access' and enter the email you used at checkout. We'll look up your subscription and restore access on the new device.",
    ],
  },
  {
    q: "Can I cancel my subscription?",
    a: [
      "Yes, anytime. Use the link in your Stripe receipt email or contact us and we'll cancel it on our side. There's no minimum term and no cancellation fee.",
    ],
  },
  {
    q: "What if the download doesn't work or is missing things?",
    a: [
      "Most issues come from edge cases on specific sites. If the analysis shows everything but the final ZIP looks wrong, contact us and tell us the URL — we'll investigate. We've added specific handling for Wix, Squarespace, Shopify, and many other platforms over time and add more as we hit edge cases.",
    ],
  },
  {
    q: "Do you respect robots.txt?",
    a: [
      "We respect rate limits and identify ourselves in the user agent. We don't aggressively crawl sites that ask us not to. If you're a site owner and you want our scraper to skip your site, contact us.",
    ],
  },
  {
    q: "How fast is it?",
    a: [
      "Static sites (plain HTML, like documentation portals) typically finish in under a minute. Modern JavaScript-heavy sites take longer because we wait for each page to fully render — usually 2–5 minutes for a typical small business site. You'll see live progress the entire time.",
    ],
  },
  {
    q: "Can I use the downloaded site on my own server?",
    a: [
      "Yes — that's exactly what the offline ZIP is for. Unzip it, upload the contents to any web host, and the site will serve from there. It's also great for migrating to a new platform: developers can rebuild from the static files.",
    ],
  },
  {
    q: "I run a business — can I get a custom plan?",
    a: [
      "Absolutely. If you need higher limits, larger downloads, or a white-label arrangement, get in touch and we'll work something out.",
    ],
  },
];

export default function Faq() {
  useSeo({
    title: "FAQ — How to Back Up, Archive & Transfer a Website | Website Sucker",
    description:
      "Answers to common questions about Website Sucker: how to back up a website, archive a site, transfer it to a new platform, what's included in the download, pricing, and how it compares to other website tools.",
    canonicalPath: "/faq",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.a.join(" "),
        },
      })),
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            data-testid="link-back-home"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Website Sucker
          </a>
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Frequently Asked Questions</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Quick answers about how Website Sucker works, what's included, and how it compares to other tools.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-6">
          {faqs.map((f, i) => (
            <div
              key={i}
              className="border rounded-xl p-6 bg-card"
              data-testid={`faq-${i}`}
            >
              <h2 className="font-semibold mb-3 text-lg">{f.q}</h2>
              {f.a.map((para, idx) => (
                <p key={idx} className="text-muted-foreground leading-relaxed mb-2 last:mb-0">
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h2 className="text-xl font-semibold mb-3">Ready to back up your site?</h2>
          <p className="text-muted-foreground mb-6">
            Paste any URL — analysing is always free. Download the complete offline copy for $1.99.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            data-testid="link-try-tool"
          >
            Try Website Sucker Free
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
