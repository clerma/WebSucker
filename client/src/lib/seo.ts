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
