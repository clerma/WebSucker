import { useEffect } from "react";

export const SITE_URL = "https://websitesucker.com";

export interface SeoOptions {
  title: string;
  description?: string;
  /** Path only, e.g. "/features". Combined with SITE_URL for canonical + og:url. */
  canonicalPath?: string;
  /** One or more JSON-LD structured-data blocks to inject into <head>. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** When true, emits <meta name="robots" content="noindex,follow"> (e.g. admin, checkout, 404). */
  noIndex?: boolean;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function removeMeta(attr: "name" | "property", key: string) {
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    ?.remove();
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function removeCanonical() {
  document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
}

/**
 * Manages per-page SEO for this single-page app: document title, meta
 * description, canonical URL, Open Graph / Twitter mirrors, and JSON-LD
 * structured data. JSON-LD blocks added here are removed on unmount so they
 * don't leak across client-side route changes.
 */
export function useSeo({ title, description, canonicalPath, jsonLd, noIndex }: SeoOptions) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    document.title = title;
    upsertMeta("property", "og:title", title);
    upsertMeta("name", "twitter:title", title);

    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
      upsertMeta("name", "twitter:description", description);
    } else {
      removeMeta("name", "description");
      removeMeta("property", "og:description");
      removeMeta("name", "twitter:description");
    }

    if (canonicalPath !== undefined) {
      const href = `${SITE_URL}${canonicalPath}`;
      upsertCanonical(href);
      upsertMeta("property", "og:url", href);
    } else {
      removeCanonical();
      removeMeta("property", "og:url");
    }

    if (noIndex) {
      upsertMeta("name", "robots", "noindex,follow");
    } else {
      removeMeta("name", "robots");
    }

    const added: HTMLScriptElement[] = [];
    if (jsonLdKey) {
      const parsed = JSON.parse(jsonLdKey) as
        | Record<string, unknown>
        | Record<string, unknown>[];
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      for (const block of blocks) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo-jsonld", "true");
        script.text = JSON.stringify(block);
        document.head.appendChild(script);
        added.push(script);
      }
    }

    return () => {
      added.forEach((s) => s.remove());
    };
  }, [title, description, canonicalPath, jsonLdKey, noIndex]);
}

/**
 * SoftwareApplication structured data for the product itself. Answer engines
 * (Google, and increasingly LLM assistants) use this to describe and price the
 * tool. Every field here is truthful; no aggregateRating/review is emitted
 * because there are no verified public reviews yet — do not add fabricated
 * ratings. Reused on the home and features pages.
 */
export const softwareApplicationSchema: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Website Sucker",
  alternateName: "WebsiteSucker",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any (web-based)",
  url: SITE_URL,
  description:
    "Website Sucker is an online tool to back up, archive, and transfer any website. Paste a URL and download a complete offline copy — HTML, CSS, JavaScript, images, and fonts — as a single ZIP. It renders JavaScript-heavy sites with a real headless browser, so modern platforms like Wix and Squarespace are captured faithfully.",
  featureList: [
    "Renders JavaScript-heavy sites with a real headless browser",
    "Captures HTML, CSS, JavaScript, images, and fonts",
    "Packages everything into a single organised ZIP",
    "Rewrites internal links so the copy works offline",
    "Free analysis of every asset before you pay",
    "Runs in any browser on Windows, Mac, Linux, or Chromebook",
  ],
  offers: [
    { "@type": "Offer", name: "Analysis", price: "0", priceCurrency: "USD", description: "Free asset inventory and size estimate for any website." },
    { "@type": "Offer", name: "Single credit", price: "1.99", priceCurrency: "USD", description: "One full scrape and ZIP download." },
    { "@type": "Offer", name: "3-credit pack", price: "4.99", priceCurrency: "USD", description: "Three scrapes and downloads — credits never expire." },
    { "@type": "Offer", name: "10-credit pack", price: "12.99", priceCurrency: "USD", description: "Ten scrapes and downloads — credits never expire." },
    { "@type": "Offer", name: "Unlimited Monthly", price: "5.99", priceCurrency: "USD", description: "Unlimited scrapes and downloads. Cancel anytime." },
  ],
};
