/**
 * Keyword landing pages — SEO/AIO entry points that funnel into the same
 * scrape flow as the home hero. Each entry is rendered by
 * client/src/pages/landing-page.tsx and routed by its `slug` in App.tsx.
 *
 * All copy here is truthful and consistent with the product: a real headless
 * browser renders JS-heavy sites, output is a single ZIP, analysis is free,
 * the first scrape is free to preview, downloads start at $1.99, and scraped
 * files are auto-deleted 10 minutes after the run. Only mention capabilities
 * the product actually has.
 */

export interface LandingFaq {
  q: string;
  a: string;
}

/** Icon keys map to lucide icons in pages/landing-page.tsx. */
export type LandingIcon =
  | "zip"
  | "render"
  | "link"
  | "device"
  | "copy"
  | "own"
  | "shield"
  | "crawl"
  | "folder"
  | "offline"
  | "gauge"
  | "backup"
  | "reference";

export interface LandingBullet {
  icon: LandingIcon;
  title: string;
  body: string;
}

export interface LandingPageContent {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  subhead: string;
  /** SEO body copy — one <p> per string. */
  intro: string[];
  bullets: LandingBullet[];
  faq: LandingFaq[];
  /** Slugs of related landing pages to cross-link. */
  related: string[];
}

export const LANDING_PAGES: LandingPageContent[] = [
  {
    slug: "website-downloader",
    metaTitle: "Website Downloader — Download Any Website as a ZIP | Website Sucker",
    metaDescription:
      "Website Sucker is an online website downloader. Paste a URL and download a complete offline copy of any site — HTML, CSS, JavaScript, images, and fonts — as a single ZIP. Renders JavaScript-heavy sites with a real browser. Free to analyse.",
    eyebrow: "Website downloader",
    h1: "Download any website as a ZIP.",
    subhead:
      "Paste a URL and get a complete offline copy — every page, image, stylesheet, script, and font — in one organised archive. No install, any device.",
    intro: [
      "A website downloader saves a live site to your own device so you can open it offline, keep a backup, or move it somewhere new. Website Sucker does this entirely in your browser: paste an address, watch it crawl every page, and download the result as a single ZIP.",
      "Older downloaders were built for the static web and choke on modern sites. Website Sucker renders each page with a real headless browser first, so JavaScript-heavy platforms — Wix, Squarespace, Webflow, React apps — are captured the way they actually look, not as an empty shell.",
      "Analysis is free: you see a full inventory of every page and asset, with a total size estimate, before you pay anything. Your first scrape is free to preview, and ZIP downloads start at $1.99.",
    ],
    bullets: [
      { icon: "zip", title: "Every asset, one ZIP", body: "HTML, CSS, JavaScript, images, and fonts, organised into folders that open offline in any browser." },
      { icon: "render", title: "Real-browser rendering", body: "A full headless browser loads each page before capture, so dynamic and lazy-loaded content is included." },
      { icon: "link", title: "Links rewritten", body: "Internal links are pointed at local files, so the downloaded copy just works with no internet connection." },
      { icon: "device", title: "Nothing to install", body: "Runs in the browser on Windows, Mac, Linux, or Chromebook — no desktop app, no command line." },
    ],
    faq: [
      { q: "How do I download an entire website?", a: "Paste the website's URL into Website Sucker and let it analyse every page and asset for free. When the inventory looks right, download the complete offline copy as a ZIP with a credit — your first scrape is free to preview." },
      { q: "Does it work on JavaScript-heavy sites?", a: "Yes. Website Sucker renders each page with a real headless browser before capturing it, so sites built on Wix, Squarespace, Webflow, or React are downloaded as they actually appear." },
      { q: "What's inside the download?", a: "A single ZIP with the site's HTML, CSS, JavaScript, images, and fonts, organised into folders. Internal links are rewritten to local paths so the copy opens offline in any browser." },
      { q: "How much does it cost?", a: "Analysing any site is free, and your first scrape is free to preview. After that, ZIP downloads are $1.99 for one credit, with packs from $1.30 per credit, or $5.99/month for unlimited downloads." },
      { q: "Is it legal to download a website?", a: "Downloading your own site, or one you have permission to copy, is fine — for backups, migrations, or offline reference. Only download sites you own or are authorised to copy, and respect the source site's terms and copyright." },
    ],
    related: ["website-copier", "website-ripper", "download-website-as-zip"],
  },
  {
    slug: "website-copier",
    metaTitle: "Website Copier — Copy Any Website Online | Website Sucker",
    metaDescription:
      "Website Sucker is an online website copier. Paste a URL and copy a complete offline version of any site — HTML, CSS, JavaScript, images, and fonts — into a single ZIP. Renders modern JavaScript sites. Free to analyse.",
    eyebrow: "Website copier",
    h1: "Copy a website, exactly as it renders.",
    subhead:
      "Make a faithful offline copy of any site and take it with you — for backups, migrations, or a local reference you fully control.",
    intro: [
      "A website copier captures a live site's files so you can keep a copy of your own. Website Sucker copies every page and asset a site is made of and hands you a single ZIP you can open, host, or archive.",
      "Because it renders each page with a real browser, the copy matches the live site — including content that only appears after scripts run. That makes it far more reliable on modern platforms than tools that just fetch raw HTML.",
      "Start free: Website Sucker lists every asset it finds and estimates the total size before you pay. Your first scrape is free to preview, and downloads start at $1.99.",
    ],
    bullets: [
      { icon: "copy", title: "Faithful copy", body: "The offline version reflects the page as rendered — dynamic content, embeds, and lazy-loaded media included." },
      { icon: "own", title: "Own your copy", body: "The ZIP is yours to keep. Host it, archive it, or use it as a reference when rebuilding." },
      { icon: "shield", title: "Private by default", body: "Copied files live on our server only long enough to download and are auto-deleted 10 minutes after the run." },
      { icon: "device", title: "Works everywhere", body: "No install and no command line — copy a site from any browser on any operating system." },
    ],
    faq: [
      { q: "How do I copy a website?", a: "Paste the site's URL into Website Sucker, let it analyse every page and asset for free, then download the complete copy as a ZIP with a credit. Your first scrape is free to preview." },
      { q: "Will the copy look like the original?", a: "Yes — Website Sucker renders each page with a real headless browser before copying, so the offline version matches how the live site actually appears, including JavaScript-rendered content." },
      { q: "Can I host the copied site myself?", a: "Yes. Unzip the download and upload the contents to any web host, or use the static files as a starting point when rebuilding on a new platform." },
      { q: "What happens to my files afterward?", a: "Your copied files are stored only temporarily so you can download them, and they're automatically deleted 10 minutes after the scrape completes. We never keep, share, or reuse them." },
      { q: "Is copying a website allowed?", a: "Copy sites you own or have permission to copy — for backups, migration, or offline reference. Respect the source site's terms of service and copyright." },
    ],
    related: ["website-downloader", "website-ripper", "download-website-as-zip"],
  },
  {
    slug: "website-ripper",
    metaTitle: "Website Ripper — Rip a Full Website to Your Device | Website Sucker",
    metaDescription:
      "Website Sucker is an online website ripper. Paste a URL and rip a whole site — every page and asset — to a single ZIP you can browse offline. Renders JavaScript-heavy sites with a real browser. Free to analyse.",
    eyebrow: "Website ripper",
    h1: "Rip a whole site to your device.",
    subhead:
      "Pull down every page and asset a website is built from and get a single ZIP you can browse offline — no desktop software required.",
    intro: [
      "A website ripper downloads all of a site's pages and assets in one pass. Website Sucker crawls the site, pulls each asset as it goes, and packages everything into one organised ZIP you can open without an internet connection.",
      "Unlike classic desktop rippers, it runs in your browser and renders each page with a real headless browser, so modern JavaScript sites come down intact instead of as a broken, script-less skeleton.",
      "Every analysis is free and shows you exactly what will be captured — pages, images, stylesheets, scripts, and fonts — with a size estimate. Your first scrape is free to preview; downloads start at $1.99.",
    ],
    bullets: [
      { icon: "crawl", title: "Whole-site crawl", body: "Follows internal links and pulls every page and asset it finds, live, as it goes." },
      { icon: "render", title: "Modern sites intact", body: "Real-browser rendering means JavaScript-driven pages are ripped as they actually render." },
      { icon: "zip", title: "One organised archive", body: "Everything lands in a single ZIP with folders for pages, CSS, JS, images, and fonts." },
      { icon: "device", title: "Browser-based", body: "No HTTrack-style desktop install — rip a site from any device with a browser." },
    ],
    faq: [
      { q: "What is a website ripper?", a: "A website ripper is a tool that downloads all of a site's pages and assets so you can browse it offline or keep a copy. Website Sucker does this online and packages the result as a single ZIP." },
      { q: "How is this different from HTTrack or SiteSucker?", a: "Website Sucker runs in the browser on any operating system — no desktop install — and renders each page with a real headless browser, so JavaScript-heavy modern sites are captured correctly where older rippers often miss dynamic content." },
      { q: "How large a site can I rip?", a: "Website Sucker handles typical small-business and portfolio sites comfortably. The free analysis shows the full page and asset count with a size estimate before you download, so you always know the scope first." },
      { q: "How long does it take?", a: "Static sites often finish in under a minute; JavaScript-heavy sites usually take 2–5 minutes because each page is fully rendered before capture. You see live progress the whole time." },
      { q: "Is ripping a website legal?", a: "Only rip sites you own or have permission to copy, and respect the source site's terms and copyright. It's ideal for backing up your own site, archiving, or migrating." },
    ],
    related: ["website-downloader", "website-copier", "download-website-as-zip"],
  },
  {
    slug: "download-website-as-zip",
    metaTitle: "Download a Website as a ZIP File | Website Sucker",
    metaDescription:
      "Download any website as a single ZIP with Website Sucker. Paste a URL to capture every page, image, stylesheet, script, and font into one organised archive you can open offline. Free to analyse; downloads from $1.99.",
    eyebrow: "Website to ZIP",
    h1: "Download a website as a ZIP file.",
    subhead:
      "One paste, one archive. Get every page and asset of a site in a single ZIP that opens offline in any browser.",
    intro: [
      "Sometimes you just want the whole site in one file. Website Sucker captures a site's pages and assets and delivers them as a single, organised ZIP — no folders to assemble by hand, no missing files.",
      "Inside the archive you get the HTML for every page plus separate folders for CSS, JavaScript, images, and fonts. Internal links are rewritten to local paths, so unzip it and the site opens and navigates offline.",
      "See exactly what you'll get before you pay: the free analysis lists every asset and estimates the ZIP size. Your first scrape is free to preview, and downloads start at $1.99.",
    ],
    bullets: [
      { icon: "zip", title: "Single file", body: "The entire site — pages, styles, scripts, images, fonts — packaged into one ZIP." },
      { icon: "folder", title: "Organised inside", body: "Clean folder structure plus a crawl report, so you can find and reuse any asset." },
      { icon: "offline", title: "Opens offline", body: "Rewritten internal links mean the unzipped site browses with no internet connection." },
      { icon: "gauge", title: "Know the size first", body: "The free analysis estimates the ZIP size before you download anything." },
    ],
    faq: [
      { q: "How do I save a website as a ZIP file?", a: "Paste the site's URL into Website Sucker, let the free analysis list every page and asset, then download the result as a single ZIP with a credit — your first scrape is free to preview." },
      { q: "What's the folder structure inside the ZIP?", a: "The ZIP contains the HTML for each page plus organised folders for CSS, JavaScript, images, and fonts, along with a crawl report of what was captured." },
      { q: "Will the ZIP work offline?", a: "Yes. Internal links are rewritten to point at the local files in the archive, so once you unzip it the site opens and navigates in any browser without an internet connection." },
      { q: "Can I download a JavaScript-heavy site to a ZIP?", a: "Yes — Website Sucker renders each page with a real headless browser before packaging it, so sites built on Wix, Squarespace, Webflow, or React are captured as they actually render." },
      { q: "How much does it cost?", a: "Analysis is free and your first scrape is free to preview. ZIP downloads are $1.99 for one credit, packs from $1.30 per credit, or $5.99/month for unlimited." },
    ],
    related: ["website-downloader", "website-copier", "website-ripper"],
  },
  {
    slug: "download-squarespace-site",
    metaTitle: "How to Download a Squarespace Site | Website Sucker",
    metaDescription:
      "Download a full copy of a Squarespace website with Website Sucker. Paste the URL to capture every page, image, style, and font as a single offline ZIP — rendered with a real browser so nothing is missed. Free to analyse.",
    eyebrow: "Squarespace",
    h1: "Download a Squarespace site.",
    subhead:
      "Squarespace has no one-click full export. Website Sucker captures the live site exactly as it renders and hands you a complete offline ZIP.",
    intro: [
      "Squarespace lets you export some content, but not a complete, ready-to-open copy of your site with its styling, images, and scripts intact. Website Sucker fills that gap: paste your Squarespace URL and it captures the rendered site — every page and asset — into one ZIP.",
      "Squarespace sites lean heavily on JavaScript, which is exactly where basic downloaders fall short. Website Sucker renders each page with a real headless browser first, so galleries, fonts, and dynamic sections come down looking like the live site.",
      "It's a fast way to keep an offline backup, archive a snapshot before a redesign, or hand a developer the static files as a reference for a migration. Analysis is free and your first scrape is free to preview.",
    ],
    bullets: [
      { icon: "render", title: "Full rendered capture", body: "Real-browser rendering pulls Squarespace's JavaScript-driven pages, galleries, and fonts as they actually appear." },
      { icon: "backup", title: "Backup before changes", body: "Keep a complete offline snapshot before a redesign, template change, or platform move." },
      { icon: "reference", title: "Migration-ready files", body: "Hand a developer the static HTML, CSS, and assets as a reference when rebuilding elsewhere." },
      { icon: "device", title: "No plugins or install", body: "Runs in the browser — nothing to add to your Squarespace account and no desktop software." },
    ],
    faq: [
      { q: "Can you download a full Squarespace website?", a: "Yes. Squarespace's built-in export is partial, but Website Sucker captures the rendered site — every page, image, style, and font — into a single offline ZIP. Paste your Squarespace URL to start a free analysis." },
      { q: "Does it capture Squarespace galleries and fonts?", a: "Yes — because each page is rendered with a real headless browser before capture, JavaScript-driven galleries, custom fonts, and dynamic sections are included in the download." },
      { q: "Can I move my Squarespace site to another platform with this?", a: "The ZIP gives you the static files and a faithful reference of the live site, which developers can use when rebuilding on WordPress, Webflow, or a hand-built site. It captures the rendered site, not Squarespace's editable source." },
      { q: "Do I need to be the site owner?", a: "Only download Squarespace sites you own or have permission to copy, and respect Squarespace's terms and any copyright. Backing up your own site is a common, legitimate use." },
      { q: "What does it cost?", a: "Analysing your site is free and your first scrape is free to preview. ZIP downloads start at $1.99, with packs from $1.30 per credit or $5.99/month unlimited." },
    ],
    related: ["download-wix-site", "website-downloader", "download-website-as-zip"],
  },
  {
    slug: "download-wix-site",
    metaTitle: "How to Download a Wix Site | Website Sucker",
    metaDescription:
      "Download a full copy of a Wix website with Website Sucker. Paste the URL to capture every page, image, style, and font as a single offline ZIP — rendered with a real browser so JavaScript content isn't missed. Free to analyse.",
    eyebrow: "Wix",
    h1: "Download a Wix site.",
    subhead:
      "Wix doesn't let you export your site's files. Website Sucker captures the live site as it renders and gives you a complete offline ZIP.",
    intro: [
      "Wix keeps your site locked to its platform — there's no built-in way to download the actual files. Website Sucker gets you a working offline copy: paste your Wix URL and it captures the rendered pages and assets into a single ZIP.",
      "Wix sites are almost entirely JavaScript-rendered, so tools that only fetch raw HTML come back nearly empty. Website Sucker renders each page with a real headless browser before capture, so the content, images, and fonts you see live are what you get.",
      "Use it to back up your Wix site, archive a snapshot before changes, or give a developer the static reference they need to rebuild elsewhere. Analysis is free and your first scrape is free to preview.",
    ],
    bullets: [
      { icon: "render", title: "Captures Wix's JavaScript", body: "Real-browser rendering pulls Wix's dynamic, script-rendered pages as they actually appear — not an empty shell." },
      { icon: "own", title: "A copy you control", body: "Wix offers no file export; the ZIP gives you an offline copy of the rendered site to keep." },
      { icon: "reference", title: "Reference for rebuilding", body: "Static HTML, images, and styles help a developer recreate the site on another platform." },
      { icon: "device", title: "Browser-based", body: "No install and nothing added to your Wix account — capture the site from any device." },
    ],
    faq: [
      { q: "Can you download a website from Wix?", a: "Wix has no built-in file export, but Website Sucker captures the rendered site — every page, image, style, and font — into a single offline ZIP. Paste your Wix URL to start a free analysis." },
      { q: "Why do other downloaders return an empty Wix page?", a: "Wix renders its pages with JavaScript, so tools that only fetch raw HTML get almost nothing. Website Sucker renders each page with a real headless browser first, so the actual content is captured." },
      { q: "Can I use this to leave Wix?", a: "The ZIP gives you an offline copy and a faithful static reference of your live site, which a developer can use when rebuilding on another platform. It captures the rendered site, not Wix's editable source." },
      { q: "Do I have to own the Wix site?", a: "Only download Wix sites you own or have permission to copy, and respect Wix's terms and any copyright. Backing up your own site is a common, legitimate use." },
      { q: "How much does it cost?", a: "Analysis is free and your first scrape is free to preview. ZIP downloads start at $1.99, with packs from $1.30 per credit or $5.99/month unlimited." },
    ],
    related: ["download-squarespace-site", "website-downloader", "download-website-as-zip"],
  },
];

export const LANDING_SLUGS = new Set(LANDING_PAGES.map((p) => p.slug));

export function getLandingPage(slug: string): LandingPageContent | undefined {
  return LANDING_PAGES.find((p) => p.slug === slug);
}
