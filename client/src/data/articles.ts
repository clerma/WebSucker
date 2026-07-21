export interface Article {
  slug: string;
  title: string;
  metaDescription: string;
  publishedDate: string;
  readingTime: string;
  category: string;
  intro: string;
  sections: {
    heading: string;
    body: string[];
    list?: string[];
  }[];
  cta: {
    heading: string;
    body: string;
  };
}

export const articles: Article[] = [
  {
    slug: "how-to-export-your-website-from-squarespace",
    title: "How to Export Your Website From Squarespace",
    metaDescription:
      "Want to leave Squarespace? Learn how to export your Squarespace website — pages, images, and content — and download a complete offline backup in minutes.",
    publishedDate: "April 2026",
    readingTime: "5 min read",
    category: "Platform Guides",
    intro:
      "Squarespace makes it surprisingly difficult to take your content with you. Their built-in export only gives you a small XML file — no images, no CSS, no actual pages. If you want a real copy of your Squarespace site, you need a different approach.",
    sections: [
      {
        heading: "What Squarespace's Built-In Export Actually Gives You",
        body: [
          "Squarespace has an official export feature, but it's almost useless for most people. Go to Settings → Advanced → Import / Export → Export and you'll get a WordPress-style XML file. This contains your blog posts and basic page text — nothing else.",
          "No images. No CSS. No JavaScript. No page layouts. No product data beyond basic fields. If you try to import this file into another platform, you'll spend days manually rebuilding the look and feel from scratch.",
        ],
      },
      {
        heading: "Why People Want to Leave Squarespace",
        body: [
          "Squarespace is a polished product, but it locks you in by design. Common reasons people want out:",
        ],
        list: [
          "Price increases — Squarespace has raised prices significantly in recent years",
          "Moving to a custom WordPress or Webflow site for more control",
          "The business is shutting down and they want an archival copy",
          "A developer is taking over and needs the actual HTML/CSS files",
          "They want to migrate content to Shopify, Wix, or another ecommerce platform",
        ],
      },
      {
        heading: "The Only Way to Get a Real Export",
        body: [
          "The only reliable way to export a complete Squarespace website — with all pages rendered exactly as they appear, including images, styles, and fonts — is to crawl the live site and download every asset.",
          "This is called a site scrape or website backup. A scraper visits every page of your site, downloads the HTML as the browser renders it, and also pulls down every linked CSS file, image, JavaScript file, and font. The result is a complete offline copy that opens in a browser without an internet connection.",
        ],
      },
      {
        heading: "Step-by-Step: Export Your Squarespace Site",
        body: [
          "Here's exactly how to do it:",
        ],
        list: [
          "Go to websitesucker.com and paste your Squarespace URL (e.g. yourname.squarespace.com or your custom domain)",
          "Click Analyse — the tool scans every page and asset for free",
          "Review the results: you'll see every HTML page, image, CSS file, and more",
          "Click Download ZIP and you'll receive a complete offline backup (credits from $1.30)",
          "Unzip the file and open index.html in any browser — it works without internet",
        ],
      },
      {
        heading: "What You Get in the Download",
        body: [
          "The ZIP file contains your site organised into folders: HTML pages at the root level, images in an assets folder, CSS and JavaScript files in their respective folders. All internal links are rewritten to point to local files, so navigation between pages works offline.",
          "Squarespace's CDN images are one of the trickiest parts — they're served from squarespace-cdn.com with complex query parameters for resizing. Website Sucker normalises all these URLs and deduplicates srcset variants so you get one clean copy of each image, not dozens of near-identical files.",
        ],
      },
      {
        heading: "What to Do With Your Export",
        body: [
          "Once you have the ZIP, your options are wide open. Hand the folder to a developer to rebuild on WordPress or another platform. Host the static HTML on a service like Netlify, Vercel, or GitHub Pages for free. Keep it archived on a hard drive as a snapshot of your site. Or use the content as a reference while building your new site on a different platform.",
        ],
      },
    ],
    cta: {
      heading: "Ready to Export Your Squarespace Site?",
      body: "Paste your URL and get a complete download in minutes. Analysing is always free — you only pay when you want the ZIP.",
    },
  },
  {
    slug: "how-to-export-your-website-from-wix",
    title: "How to Export Your Website From Wix",
    metaDescription:
      "Wix has no export button. Here's how to export your Wix website — pages, images, and all assets — and download a complete offline backup.",
    publishedDate: "April 2026",
    readingTime: "5 min read",
    category: "Platform Guides",
    intro:
      "Wix does not have an export feature. There is no button, no settings page, no workaround inside the platform itself. If you want to take your content with you, you have to work around the platform entirely — and that's exactly what we'll show you how to do.",
    sections: [
      {
        heading: "Why Wix Doesn't Let You Export",
        body: [
          "This isn't an accident. Wix's business model depends on keeping you on their platform. Once you've built a site in Wix's proprietary editor, your layouts, animations, and design are all stored in Wix's own format — not standard HTML. There's no direct export because there's nothing to export in a portable format.",
          "This is a known frustration for millions of Wix users who want to move to WordPress, Squarespace, Shopify, or a custom-built site.",
        ],
      },
      {
        heading: "What You Can Actually Get From Wix",
        body: [
          "Despite the no-export policy, there are a few things you can retrieve directly from Wix:",
        ],
        list: [
          "Blog posts — can be exported to CSV from your blog dashboard",
          "Store products — can be exported to CSV from your ecommerce dashboard",
          "Contact lists — can be exported from the CRM section",
          "Individual images — can be downloaded one at a time from the media library",
        ],
      },
      {
        heading: "How to Export the Actual Website",
        body: [
          "The only way to get a complete export of what your Wix website actually looks like — every page rendered with full styles, images, and layout — is to crawl the live published version.",
          "Wix renders sites using JavaScript, which means a simple page download won't work. You need a tool that runs a real browser, scrolls through each page to trigger lazy-loaded content, and captures the fully rendered HTML along with every linked asset.",
          "Website Sucker does exactly this. It uses a headless Chrome browser behind the scenes to render your Wix pages exactly as a visitor would see them, then downloads and packages everything into an offline ZIP.",
        ],
      },
      {
        heading: "Step-by-Step: Export Your Wix Site",
        body: [
          "Make sure your Wix site is published (not in preview mode) before starting.",
        ],
        list: [
          "Open websitesucker.com in your browser",
          "Paste your published Wix URL — this must be the live site, not the editor",
          "Click Analyse — scraping is completely free",
          "You'll see all HTML pages, images, CSS, and other assets listed",
          "Click Download ZIP to get your complete offline backup (credits from $1.30)",
        ],
      },
      {
        heading: "Wix-Specific Considerations",
        body: [
          "Wix sites have some quirks worth knowing about. Images are served from wixstatic.com with complex transformation URLs (different sizes, formats, crops). Website Sucker normalises these so you get one clean image file per image instead of dozens of variants.",
          "Wix also uses custom elements like wix-iframe for embedded content. These are automatically converted to standard HTML iframes in the download so they render correctly offline.",
          "Some interactive Wix features — booking forms, live chat, membership areas — require server-side logic that can't be captured in a static export. The download will contain the visual pages but those dynamic features won't function without a backend.",
        ],
      },
      {
        heading: "Using Your Wix Export",
        body: [
          "The most common use case is handing the exported HTML to a developer who will rebuild the site from scratch on a new platform, using the export as a visual reference. You can also host the static export cheaply on Netlify or GitHub Pages, or simply keep it as an archived copy.",
        ],
      },
    ],
    cta: {
      heading: "Export Your Wix Site Now",
      body: "Just paste your published Wix URL. Create a free account — your first scrape is free to preview. Download the complete ZIP with a credit (from $1.30).",
    },
  },
  {
    slug: "how-to-backup-your-website",
    title: "How to Back Up Your Website",
    metaDescription:
      "A practical guide to backing up your website — what to include, how often to do it, and the easiest way to create a complete offline copy of any site.",
    publishedDate: "April 2026",
    readingTime: "6 min read",
    category: "Website Backup",
    intro:
      "Most website owners don't think about backups until something goes wrong. A hosting provider goes under, a plugin update breaks the site, a database gets corrupted, or worse — an account gets hacked. By the time you need a backup, it's too late to make one. Here's how to get ahead of it.",
    sections: [
      {
        heading: "What Does a Website Backup Actually Include?",
        body: [
          "A complete website backup should contain everything needed to restore or recreate the site. That means:",
        ],
        list: [
          "All HTML pages — the actual content of every page",
          "CSS stylesheets — everything that controls the appearance",
          "JavaScript files — functionality, animations, interactivity",
          "Images and media — photos, videos, icons, logos",
          "Fonts — custom typography files",
          "Database content — if your site uses one (WordPress, custom CMS, etc.)",
        ],
      },
      {
        heading: "Different Sites Need Different Backup Approaches",
        body: [
          "The right backup method depends on how your site is built.",
          "WordPress sites: Your host likely offers automated backups through cPanel or a managed WordPress plan. Plugins like UpdraftPlus or All-in-One WP Migration can also create and schedule full backups including the database.",
          "Hosted platforms (Wix, Squarespace, Shopify): These providers handle server infrastructure for you, but they offer little or no export functionality. Your backup options are limited to what you can extract from the live site.",
          "Custom or static sites: If you have server access, you can use FTP/SFTP to download all files. For sites you don't have backend access to, you need to crawl the live version.",
        ],
      },
      {
        heading: "The Easiest Way to Back Up Any Website",
        body: [
          "If you need a backup of what your site actually looks like — not the database, not the raw files, but the rendered pages a visitor sees — the simplest approach is a site crawl.",
          "A site crawl visits every page of your website, downloads the fully rendered HTML, and grabs every linked asset (images, CSS, JS, fonts). The result is an offline-ready ZIP that looks exactly like your live site.",
          "This works for any website regardless of how it's built — WordPress, Wix, Squarespace, custom HTML, whatever. You don't need access to the server, the database, or the CMS admin panel.",
        ],
      },
      {
        heading: "How to Back Up a Website With Website Sucker",
        body: [
          "Website Sucker is purpose-built for this. It's the browser-based equivalent of SiteSucker for Mac.",
        ],
        list: [
          "Go to websitesucker.com",
          "Paste the URL of the website you want to back up",
          "Click Analyse — the scan is completely free",
          "Review the list of pages and assets found",
          "Click Download ZIP to get the complete offline backup (credits from $1.30)",
          "Unzip and open in a browser — no internet required",
        ],
      },
      {
        heading: "How Often Should You Back Up?",
        body: [
          "For most small business sites that change infrequently, a quarterly backup is a good minimum. If you publish new content regularly — a blog, a portfolio, product updates — consider monthly. If your site is your primary business tool, weekly or even daily backups make sense.",
          "The general rule: how much work would you lose if your site disappeared today? Back up often enough that the answer is 'not much.'",
        ],
      },
      {
        heading: "Where to Store Your Backup",
        body: [
          "Store backups in at least two places. A local copy on your computer or an external drive, plus a cloud copy in Google Drive, Dropbox, or similar. If your site is critical to your business, consider a third copy stored offsite.",
          "ZIP files from Website Sucker are typically between 10MB and 500MB depending on the size of the site — well within the free tier of any cloud storage service.",
        ],
      },
    ],
    cta: {
      heading: "Back Up Your Website Now",
      body: "Paste any URL and get a complete offline backup. Your first scrape is free to preview — downloads start at $1.30 with a credit pack.",
    },
  },
  {
    slug: "why-you-should-backup-your-website",
    title: "Why You Should Back Up Your Website (And Most People Don't)",
    metaDescription:
      "Website backups are one of the most neglected tasks in running an online presence. Here's exactly why they matter and what happens when you don't have one.",
    publishedDate: "April 2026",
    readingTime: "5 min read",
    category: "Website Backup",
    intro:
      "Website backups are one of the most talked-about and least-acted-upon tasks in web management. Everyone knows they should do it. Almost nobody does. And then something goes wrong, and the regret is instant. Here's the honest case for why backups matter — and why most people skip them until it's too late.",
    sections: [
      {
        heading: "Your Hosting Provider Is Not Your Backup Plan",
        body: [
          "This is the most common misconception. Many people assume their web host is keeping their site safe. Some do offer backups — but the terms vary wildly. Many shared hosting plans backup your files but not your database. Some only keep backups for 7 or 30 days. Some charge extra to restore from backup. And some don't back up at all.",
          "A hosting provider going out of business, having a major server failure, or simply having you exceed your storage limit can result in your site being deleted with little or no warning. If your only backup is in the same place as your live site, it's not really a backup.",
        ],
      },
      {
        heading: "Things That Actually Happen to Websites",
        body: [
          "It's easy to think 'that won't happen to me.' But these are common, documented events that happen to websites every day:",
        ],
        list: [
          "Hosting account suspended for non-payment or TOS violation — site deleted within days",
          "WordPress plugin update breaks the site — theme or database corruption",
          "Domain not renewed — site goes down, sometimes permanently",
          "Hacking or malware injection — files altered or deleted by attackers",
          "Accidental deletion — a developer or client accidentally deletes the wrong thing",
          "CMS platform discontinues your plan or shuts down entirely",
          "You leave Wix or Squarespace and your account is closed",
        ],
      },
      {
        heading: "The Cost of Not Having a Backup",
        body: [
          "The cost of rebuilding a website from scratch is almost always more expensive — in time, money, or both — than the cost of maintaining backups would have been.",
          "A basic brochure site might take a developer 20-40 hours to rebuild. An ecommerce site with product pages, blog posts, and custom design can take months. If that content wasn't backed up anywhere, it's simply gone.",
          "For a business that generates leads or sales from its website, even a few days of downtime during a rebuild can mean significant lost revenue.",
        ],
      },
      {
        heading: "SaaS Platforms: The False Sense of Security",
        body: [
          "Wix, Squarespace, Shopify, and similar platforms create a particular kind of false confidence. Because someone else is managing the servers, people assume their content is safe. And in terms of uptime, it usually is — until you want to leave.",
          "When you close a Wix account, your site is gone. Squarespace gives you a short grace period after cancellation. Shopify retains some data but not your storefront design. If you don't have an export before closing the account, you have nothing.",
          "Even without closing your account: if the platform changes its pricing, discontinues a feature you rely on, or makes a change that breaks your site, having an offline backup means you have options. Without one, you're at their mercy.",
        ],
      },
      {
        heading: "How Easy It Is to Do It Now",
        body: [
          "The barrier to backing up a website has never been lower. You don't need to understand servers, databases, or FTP. You just need the URL of your live website.",
          "Website Sucker crawls any public website and packages every page, image, stylesheet, and file into a single downloadable ZIP — your first scrape is free to preview, and credits start at $1.30 per download. That's it. One URL, one credit, one offline copy that works in any browser without internet.",
        ],
      },
    ],
    cta: {
      heading: "Don't Wait Until Something Goes Wrong",
      body: "Back up your site today. Your first scrape is free to preview — downloads start at $1.30 with a credit pack.",
    },
  },
  {
    slug: "how-to-download-all-images-from-a-website",
    title: "How to Download All Images From a Website at Once",
    metaDescription:
      "Need to download all images from a website? Here are the best methods — from browser tools to full site scrapers — and when to use each one.",
    publishedDate: "April 2026",
    readingTime: "5 min read",
    category: "How-To Guides",
    intro:
      "Whether you're migrating a site, creating a backup, or collecting your own photos from a platform that makes it hard to do, downloading all images from a website at once is a common and completely legitimate task. Here are the best ways to do it.",
    sections: [
      {
        heading: "Option 1: Browser Developer Tools (Small Sites)",
        body: [
          "For a single page with a handful of images, your browser's built-in tools can work. Open Chrome or Firefox, go to the page, press F12 to open DevTools, then go to the Network tab. Reload the page and filter by 'Img' — you'll see every image the page loaded. Right-click each one to save it.",
          "This works but it's completely manual. For a site with dozens of pages and hundreds of images, it's not practical.",
        ],
      },
      {
        heading: "Option 2: Download Manager Browser Extensions",
        body: [
          "Extensions like DownThemAll (Firefox) or Image Downloader (Chrome) can grab all visible images from a single page. They're easy to use but have significant limitations:",
        ],
        list: [
          "Only captures images on the current page — you have to repeat for every page",
          "Misses CSS background images which don't appear in the HTML",
          "Misses lazy-loaded images that haven't scrolled into view yet",
          "Doesn't organise images into any folder structure",
          "Won't work across an entire multi-page site",
        ],
      },
      {
        heading: "Option 3: Full Site Scraper (Best for Complete Downloads)",
        body: [
          "For downloading every image from an entire website — not just one page — you need a site scraper. A proper scraper crawls every page, follows internal links, triggers lazy-loaded content, and downloads every image it finds, including those referenced in CSS stylesheets and srcset attributes.",
          "Website Sucker is built for exactly this. It crawls your entire site, handles JavaScript-rendered content (common on Wix, Squarespace, and other modern platforms), and packages all images along with the rest of the site's assets into a tidy ZIP file.",
        ],
      },
      {
        heading: "How to Download All Site Images With Website Sucker",
        body: [
          "This takes just a few minutes:",
        ],
        list: [
          "Go to websitesucker.com and enter your website URL",
          "Click Analyse — the scan is completely free",
          "You'll see a breakdown of all assets found, including how many images",
          "Click Download ZIP to get everything (credits from $1.30)",
          "In the ZIP, all images are in the assets/images folder, named and organised",
        ],
      },
      {
        heading: "What Types of Images Are Captured",
        body: [
          "A full site scrape captures images regardless of how they're embedded. This includes:",
        ],
        list: [
          "Standard <img> tags — the most common type",
          "srcset attributes — multiple resolution versions of the same image",
          "CSS background-image properties — images used as backgrounds in stylesheets",
          "Lazy-loaded images — images with data-src that only load when scrolled into view",
          "Open Graph and meta images — used for social media sharing previews",
          "Favicon and app icons — the small images used in browser tabs",
        ],
      },
      {
        heading: "What About Images on Wix or Squarespace?",
        body: [
          "Wix and Squarespace serve images through their own CDNs with complex transformation parameters — things like crop dimensions, quality settings, and format conversions baked into the URL. A naive download would grab dozens of near-identical resized versions of the same image.",
          "Website Sucker handles this intelligently: Squarespace CDN URLs are deduplicated by stripping resize parameters, and Wix CDN URLs are normalised to their base version. You get one clean image per original file.",
        ],
      },
    ],
    cta: {
      heading: "Download All Your Site's Images Now",
      body: "Paste any URL and see every image on your site for free. Download the complete set in a single ZIP with a credit (from $1.30) — your first scrape is free to preview.",
    },
  },
  {
    slug: "how-to-transfer-your-website-to-a-new-platform",
    title: "How to Transfer Your Website From One Platform to Another",
    metaDescription:
      "Moving your website to a new platform? Here's a practical guide to transferring from Wix, Squarespace, or any CMS without losing your content or design.",
    publishedDate: "April 2026",
    readingTime: "7 min read",
    category: "Website Migration",
    intro:
      "Moving a website from one platform to another is one of the most common — and most stressful — tasks in web management. Whether you're going from Wix to WordPress, Squarespace to Shopify, or a custom site to a hosted platform, the process involves far more than just copying files. Here's how to approach it without losing everything.",
    sections: [
      {
        heading: "Why Website Transfers Are Complicated",
        body: [
          "Every platform stores content differently. Wix uses a proprietary format that doesn't map to standard HTML. Squarespace uses its own templating system. WordPress stores content in a MySQL database in a structure that differs from every other CMS. None of these formats are directly compatible with each other.",
          "This means there's no single button that moves a website from Platform A to Platform B. Every migration involves some combination of exporting content, reformatting it, and rebuilding the design on the new platform.",
        ],
      },
      {
        heading: "Step 1: Get a Complete Copy of Your Current Site",
        body: [
          "Before you touch anything, create a complete offline backup of your current site. This is your safety net and your reference document throughout the migration.",
          "The best way to do this is with a site scraper that captures the fully rendered version of every page — exactly what a visitor sees, including images, layout, and styles. This becomes your visual reference when rebuilding on the new platform.",
          "Website Sucker crawls any live website and downloads it as a complete offline ZIP. You can open it in a browser without internet and use it as a pixel-by-pixel reference during rebuilding.",
        ],
      },
      {
        heading: "Step 2: Identify What Needs to Transfer",
        body: [
          "Not everything on your site is equal in terms of migration effort. Make a list of what matters most:",
        ],
        list: [
          "Core pages — homepage, about, contact, services, etc.",
          "Blog posts — if you have many, these are usually the most time-consuming",
          "Product catalog — descriptions, images, prices, variants",
          "Images and media — every photo, video, and document",
          "Forms and integrations — contact forms, booking systems, email signup",
          "SEO data — page titles, meta descriptions, URL slugs",
        ],
      },
      {
        heading: "Step 3: Choose the Right Migration Method for Your Content",
        body: [
          "Different content types migrate differently:",
          "For blog posts: Most platforms can import/export posts as XML or CSV. WordPress's native XML format is supported by many other CMS platforms. If yours isn't, tools like CMS2CMS or manual copy-paste may be needed.",
          "For page content: Pages usually require manual recreation on the new platform. Your offline backup is invaluable here — open each page alongside the new editor and rebuild it section by section.",
          "For images: Download all images from your current site first (your site backup includes them all). Upload to the new platform's media library, then reference them in your rebuilt pages.",
          "For ecommerce products: Most platforms export product catalogs to CSV. Check your current platform's export options under Settings → Store or similar.",
        ],
      },
      {
        heading: "Step 4: Set Up URL Redirects",
        body: [
          "This step is critical for SEO and is the one most people forget. If your old site had URLs like /blog/my-post and your new site uses /posts/my-post, anyone with an old link — or Google's index of your site — will hit a 404 error.",
          "Before launching the new site, map every old URL to its equivalent new URL and set up 301 redirects. Your old host should allow you to set these up even after you've pointed your domain elsewhere.",
        ],
      },
      {
        heading: "Step 5: Migrate Your Domain",
        body: [
          "Don't move your domain until the new site is fully tested. Use the new platform's staging environment or a temporary URL to check everything first. When you're satisfied, update your domain's DNS settings to point to the new host. DNS changes propagate within a few hours to 48 hours.",
        ],
      },
      {
        heading: "Common Platform-to-Platform Migrations",
        body: [
          "Wix to WordPress: No native export exists. Download your site with a scraper, export blog posts from Wix dashboard, rebuild pages manually using your backup as a visual reference.",
          "Squarespace to WordPress: Squarespace's XML export works reasonably well for blog content. Pages need manual rebuilding. Images must be downloaded and re-uploaded.",
          "Any platform to a static site: Download your site as a static ZIP and host it directly on Netlify, GitHub Pages, or Vercel. No CMS required — just upload the files.",
        ],
      },
    ],
    cta: {
      heading: "Start With a Complete Backup",
      body: "Before you transfer anything, download a complete offline copy of your current site. Your first scrape is free to preview — ZIP downloads start at $1.30 with a credit pack.",
    },
  },
  {
    slug: "how-to-convert-your-website",
    title: "How to Convert Your Website (To a New Format, Platform, or Use)",
    metaDescription:
      "Converting your website to a new platform, format, or static HTML? Here's the practical guide to converting any website without losing your content.",
    publishedDate: "April 2026",
    readingTime: "6 min read",
    category: "Website Migration",
    intro:
      "Website conversion can mean a few different things: changing platforms (Wix to WordPress), changing formats (dynamic CMS to static HTML), or repurposing a site for a new use (archiving a business that closed, creating an offline version for a client). This guide covers all three.",
    sections: [
      {
        heading: "What Does 'Converting a Website' Mean?",
        body: [
          "The term gets used loosely, so let's define the main scenarios:",
        ],
        list: [
          "Platform conversion — moving from one CMS or website builder to another (Wix → WordPress, Squarespace → Webflow, etc.)",
          "Format conversion — changing from a dynamic database-driven site to static HTML files, or vice versa",
          "Offline conversion — creating an offline, browser-openable version of a live website",
          "Archive conversion — creating a permanent snapshot of a site before it goes offline",
        ],
      },
      {
        heading: "Converting to a Different Platform",
        body: [
          "Platform conversions are the most common and the most involved. The challenge is that every platform uses its own content format, template system, and data structure. There is no universal conversion tool.",
          "The practical approach: treat the conversion as a rebuild, not a migration. Use a complete download of your current site as a visual specification document. Rebuild the design and content on the new platform, using your offline copy as the reference for every page.",
          "Start with the highest-traffic pages (usually home, about, services, and top blog posts) and work down from there. Automate where you can — blog post exports as CSV or XML, product catalog exports — and do the rest manually.",
        ],
      },
      {
        heading: "Converting to Static HTML",
        body: [
          "Converting a dynamic website (one powered by WordPress, a CMS, or a page builder) to static HTML is increasingly popular. Static sites are faster, more secure, cheaper to host, and simpler to maintain.",
          "The conversion process is essentially: crawl the live site, capture every page as rendered HTML, download all assets, and package them. The result is a folder of HTML files that can be opened in a browser without any server-side software.",
          "This is exactly what Website Sucker produces. You get a ZIP of your site in pure static HTML — no PHP, no databases, no CMS required. You can host it on any web server or service that supports static files.",
        ],
      },
      {
        heading: "Converting a Website to an Offline Version",
        body: [
          "Sometimes you need a version of a website that works without internet access — for a trade show presentation, a client demo, a sales pitch on a plane, or a permanent archive.",
          "A proper offline conversion requires more than just saving pages — you need every asset referenced in those pages (CSS, JS, images, fonts) to also be saved locally, with all links rewritten to point to local files instead of URLs.",
          "Website Sucker handles this automatically. Every internal link in the downloaded pages is rewritten to work with the local file structure. Open the ZIP anywhere, on any device, with no internet, and the site looks exactly as it does online.",
        ],
      },
      {
        heading: "Converting a Closing Business Site to an Archive",
        body: [
          "When a business closes, its website often goes with it — and all the content, photos, and history it contained disappear from the internet. Converting the site to an offline archive before it goes down preserves that record permanently.",
          "The process is the same as any other download: paste the URL, analyse, download the ZIP, store it somewhere safe. A 500-page site with hundreds of photos can be archived in a single afternoon for less than $2.",
        ],
      },
      {
        heading: "Hosting a Converted Static Site",
        body: [
          "Once you have your static HTML export, you have several free or near-free hosting options:",
        ],
        list: [
          "Netlify — drag and drop your ZIP to deploy in minutes, free tier available",
          "GitHub Pages — upload files to a repository and get a free hosted URL",
          "Vercel — similar to Netlify, excellent free tier",
          "Cloudflare Pages — very fast CDN-backed static hosting, generous free tier",
          "Amazon S3 — reliable and scalable, small sites cost cents per month",
        ],
      },
    ],
    cta: {
      heading: "Convert Your Website Now",
      body: "Paste any URL and get a fully converted static version of your site. Your first scrape is free to preview — downloads start at $1.30 with a credit pack.",
    },
  },
  {
    slug: "backup-your-website-in-60-seconds",
    title: "How to Back Up Your Website in 60 Seconds",
    metaDescription:
      "Think website backups are complicated? They don't have to be. Here's how to create a complete offline backup of any website in under 60 seconds — no software to install.",
    publishedDate: "April 2026",
    readingTime: "3 min read",
    category: "Website Backup",
    intro:
      "Most people assume website backups are complicated — servers, databases, FTP clients, cron jobs. They're not. If your site is live on the internet, you can back up the entire thing in under 60 seconds. Here's exactly how.",
    sections: [
      {
        heading: "What You Need",
        body: [
          "Just two things: your website's URL and a browser. No software to download and no technical knowledge required — just a free account.",
        ],
      },
      {
        heading: "Step 1 — Paste Your URL (5 seconds)",
        body: [
          "Go to websitesucker.com. You'll see a single text field. Paste your website URL — the full address starting with https:// — and click Analyse.",
        ],
      },
      {
        heading: "Step 2 — Let It Scan (30–50 seconds)",
        body: [
          "Website Sucker crawls every page of your site and catalogues every asset: HTML pages, images, CSS stylesheets, JavaScript files, fonts, and more. You'll see a real-time count of what's been found as it works.",
          "For a typical small business site with 10–30 pages, this takes around 30 seconds. Larger sites with hundreds of pages will take a few minutes, but the scan still starts immediately.",
        ],
      },
      {
        heading: "Step 3 — Download Your Backup",
        body: [
          "Once the scan is complete, click Download ZIP. A single credit (from $1.30) unlocks the download; your first scrape is free to preview. You'll receive a single ZIP file containing every page and asset from your site, organised into a clean folder structure.",
          "Unzip it anywhere and open index.html in a browser — it works exactly like your live site, with no internet required.",
        ],
      },
      {
        heading: "What's in the ZIP?",
        body: ["Your backup includes everything a visitor would see:"],
        list: [
          "Every HTML page — rendered as a browser sees it, not raw server templates",
          "All images — including CDN-hosted photos, background images, and thumbnails",
          "CSS and JavaScript — all the styling and interactivity",
          "Fonts — so the typography looks exactly right offline",
          "All links rewritten — click between pages in the ZIP just as you would online",
        ],
      },
      {
        heading: "Works on Any Website",
        body: [
          "It doesn't matter whether your site runs on WordPress, Wix, Squarespace, Shopify, Webflow, or a completely custom stack. Website Sucker works from the live URL — no access to your server, admin panel, or database needed.",
          "This is particularly useful for sites hosted on platforms like Wix and Squarespace that have no built-in export feature. The backup captures exactly what your site looks like to any visitor.",
        ],
      },
      {
        heading: "Save It, Share It, Store It",
        body: [
          "Once you have the ZIP, keep it somewhere safe: a hard drive, Dropbox, Google Drive, or an external SSD. If anything ever happens to your live site — hosting issues, accidental deletion, platform shutting down — you have a complete copy you can refer to or restore from.",
          "At $1.30–$1.66 per backup with a credit pack, it's one of the cheapest insurance policies you can buy for your online presence.",
        ],
      },
    ],
    cta: {
      heading: "Back Up Your Site Right Now",
      body: "Paste your URL, preview your first scrape free, and download with a credit from $1.30. Done in under 60 seconds.",
    },
  },
  {
    slug: "best-free-website-downloader-tools-2026",
    title: "Best Free Website Downloader Tools in 2026 (Honest Comparison)",
    metaDescription:
      "We compared the most popular website downloader tools — SiteSucker, HTTrack, WebsiteDownloader.io, SaveWeb2ZIP, and Website Sucker. Here's which one fits your use case.",
    publishedDate: "April 2026",
    readingTime: "9 min read",
    category: "Comparisons",
    intro:
      "Looking for a free way to download a complete website for offline use, archival, or migration? There are a lot of tools out there, but most haven't been updated in years and silently break on modern sites built with Wix, Squarespace, React, or anything else that loads content with JavaScript. Here's an honest, hands-on comparison of the tools that actually still work in 2026.",
    sections: [
      {
        heading: "What to Look For in a Website Downloader",
        body: [
          "Not all downloaders are equal. Before picking one, check whether it handles the things real-world websites need:",
        ],
        list: [
          "JavaScript rendering — most modern sites won't show their full content unless the tool runs them in a real browser",
          "Lazy-loaded images — galleries and image-heavy pages often skip downloads if the tool can't trigger scrolling",
          "Embedded videos and maps — YouTube, Vimeo, Spotify, Google Maps, etc. should keep working offline",
          "Asset rewriting — links between pages and to images/CSS need to be rewritten to relative paths so the offline copy works",
          "Speed and reliability — if the tool crashes on a 50-page site, it's not useful",
          "Cost transparency — some 'free' tools nag you for $30+ before you can download anything",
        ],
      },
      {
        heading: "1. SiteSucker (macOS / iOS)",
        body: [
          "SiteSucker is the long-standing classic for Mac users. It's been around since 2005 and does a solid job downloading static and lightly dynamic websites. The interface is dated but functional, and once a download finishes you get a properly organised folder you can open in any browser.",
          "Downsides: it's macOS-only (or iOS), and it doesn't run JavaScript — so for any modern Wix, Squarespace, or React-based site you'll get an incomplete copy with missing images and broken layouts. The Mac version is paid (around $5), the Pro version more.",
        ],
        list: [
          "Best for: Mac users downloading older, static HTML websites",
          "Not for: Modern JS-heavy sites, Windows/Linux users, anyone who needs embeds preserved",
        ],
      },
      {
        heading: "2. HTTrack (Windows / Linux / Mac)",
        body: [
          "HTTrack is the venerable open-source option. It's free, cross-platform, and extremely configurable. If you're a developer who wants to script a recursive download with very specific filters, HTTrack is powerful.",
          "The catch: the UI looks like it's from 1999, the configuration is intimidating, and like SiteSucker it doesn't render JavaScript. Sites built with React, Vue, or any modern CMS often come back as empty shells.",
        ],
        list: [
          "Best for: Power users mirroring static documentation sites or simple HTML pages",
          "Not for: Anyone who wants a one-click experience or needs JS-rendered content",
        ],
      },
      {
        heading: "3. WebsiteDownloader.io",
        body: [
          "A web-based tool that doesn't require any install. You paste a URL, wait, and get a ZIP. Convenient, but in our testing it struggled with anything beyond static sites — JavaScript-rendered sites came back missing most of their content, and it has trouble with sites that lazy-load images on scroll.",
          "It's also paid for anything beyond a small free quota.",
        ],
        list: [
          "Best for: Quick one-off downloads of small static sites",
          "Not for: Modern sites, large sites, or sites where you need every image",
        ],
      },
      {
        heading: "4. SaveWeb2ZIP",
        body: [
          "SaveWeb2ZIP focuses on saving a single page (not a whole site) as a ZIP. It's good for archiving a specific article or product page, but if you want a full multi-page backup it's not the right tool — you'd have to repeat the process for every URL.",
        ],
        list: [
          "Best for: Saving a single web page for offline reference",
          "Not for: Multi-page sites, full backups, or migrations",
        ],
      },
      {
        heading: "5. Website Sucker (websitesucker.com)",
        body: [
          "Full disclosure — this is our tool, but here's the honest pitch: Website Sucker was built specifically because the tools above don't handle modern sites well. It runs a real headless browser (Puppeteer) to render JavaScript, scrolls pages to trigger lazy-loaded images, preserves YouTube/Vimeo/Spotify/Google Maps embeds, deduplicates Wix and Squarespace CDN images, and rewrites every link to work offline.",
          "Your first scrape is free to preview. ZIP downloads take a credit — packs from $1.30 per download — or $5.99/month for unlimited scrapes and downloads. No installs, runs in your browser.",
        ],
        list: [
          "Best for: Modern websites (Wix, Squarespace, Shopify, React, etc.), embed-heavy sites, image-heavy galleries",
          "Not for: Anyone who insists on free-only and is willing to fight HTTrack's config",
        ],
      },
      {
        heading: "Quick Comparison Table",
        body: [
          "Here's a side-by-side based on our testing on a handful of real sites:",
        ],
        list: [
          "Renders JavaScript — Website Sucker: yes • SiteSucker: no • HTTrack: no • WebsiteDownloader.io: partial • SaveWeb2ZIP: yes (single page only)",
          "Cross-platform — Website Sucker: yes (browser) • SiteSucker: macOS/iOS only • HTTrack: yes • WebsiteDownloader.io: yes • SaveWeb2ZIP: yes",
          "Preserves embeds — Website Sucker: yes • SiteSucker: no • HTTrack: no • WebsiteDownloader.io: no • SaveWeb2ZIP: partial",
          "Multi-page sites — Website Sucker: yes • SiteSucker: yes • HTTrack: yes • WebsiteDownloader.io: yes • SaveWeb2ZIP: no (single page)",
          "Cost — Website Sucker: from $1.30 / $5.99 mo • SiteSucker: ~$5 paid app • HTTrack: free • WebsiteDownloader.io: paid past free quota • SaveWeb2ZIP: free",
        ],
      },
      {
        heading: "Which One Should You Use?",
        body: [
          "If you're on Mac and downloading a plain HTML site: SiteSucker is fine.",
          "If you're a developer mirroring a documentation site and don't mind config: HTTrack.",
          "If you want a single article saved for offline: SaveWeb2ZIP.",
          "If you have a modern Wix/Squarespace/Shopify/React site and just want a working offline copy without fighting any tools: try Website Sucker first — it's free to analyse and you only pay if you actually want the ZIP.",
        ],
      },
    ],
    cta: {
      heading: "Try It on Your Own Site",
      body: "Paste any URL — analysing is always free. See exactly what we'd download before paying a cent.",
    },
  },
  {
    slug: "website-sucker-vs-sitesucker",
    title: "Website Sucker vs SiteSucker: Which Should You Use in 2026?",
    metaDescription:
      "Confused between Website Sucker (web app) and SiteSucker (Mac app)? Here's a side-by-side breakdown of features, pricing, and which one fits your situation.",
    publishedDate: "April 2026",
    readingTime: "6 min read",
    category: "Comparisons",
    intro:
      "SiteSucker is the well-known Mac app that's been around for almost two decades. Website Sucker is a newer, browser-based alternative built for modern sites. Despite the similar names, they're different tools with different strengths. Here's how they actually compare.",
    sections: [
      {
        heading: "The Quick Summary",
        body: [
          "SiteSucker is a downloadable Mac/iOS app that crawls websites and saves them locally. Website Sucker is a web app — you paste a URL in your browser and download a ZIP, no install required. SiteSucker is older and more configurable. Website Sucker is newer, works on any device, and handles modern JavaScript-heavy sites that SiteSucker often can't.",
        ],
      },
      {
        heading: "Platform Support",
        body: [
          "SiteSucker only runs on Mac (with a separate iOS version). If you're on Windows or Linux, you can't use it at all.",
          "Website Sucker runs in any modern browser — Chrome, Safari, Firefox, Edge, on Mac, Windows, Linux, ChromeOS, even mobile. There's nothing to download or install.",
        ],
      },
      {
        heading: "JavaScript-Rendered Sites",
        body: [
          "This is the biggest practical difference. SiteSucker fetches HTML the way a basic HTTP client does — it doesn't run JavaScript. So for sites built with Wix, Squarespace, Shopify, React, Vue, Angular, or any modern framework, SiteSucker often returns an empty shell with missing content, no images, and broken styling.",
          "Website Sucker runs a real headless Chrome browser behind the scenes (using Puppeteer). It renders JavaScript, scrolls pages to trigger lazy-loaded images, and waits for content to fully load before downloading. The result: a complete offline copy of modern sites, not a broken skeleton.",
        ],
      },
      {
        heading: "Embedded Content",
        body: [
          "SiteSucker downloads HTML, CSS, JS, and images, but doesn't do anything special with embedded YouTube videos, Vimeo players, Google Maps, Spotify, or social embeds. They typically appear as broken iframes when you open the offline copy.",
          "Website Sucker preserves embeds from 25+ providers so they keep working offline — videos still play (when you have internet), maps still load, and Spotify/SoundCloud players remain functional.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "SiteSucker is a paid Mac app — around $4.99 for the standard version, more for the Pro version with extra features. Once you buy it, it's yours.",
          "Website Sucker is free to use for analysing any site — you see exactly what would be downloaded before paying. Downloads take a credit — packs start at $1.30 per backup — or $5.99/month for unlimited scrapes and downloads. If you only need one or two backups, you'll save money. If you need dozens per month, the subscription is the better deal.",
        ],
      },
      {
        heading: "Speed & Convenience",
        body: [
          "SiteSucker, once installed and configured, is fast. But you have to install it, configure download depth and filters, and actually open the app each time.",
          "Website Sucker is instant — paste a URL, hit go, watch the live progress in the browser, download the ZIP. No setup, no config screens. Each scrape gets its own session that auto-expires after 10 minutes for privacy.",
        ],
      },
      {
        heading: "When SiteSucker Is Still the Better Choice",
        body: [
          "SiteSucker is the right tool when:",
        ],
        list: [
          "You're on a Mac and the site you want is mostly static HTML",
          "You want very granular control over what gets downloaded (depth, file types, URL filters)",
          "You'll be downloading the same site repeatedly and want a saved configuration",
          "You don't want recurring fees and prefer a one-time app purchase",
        ],
      },
      {
        heading: "When Website Sucker Is the Better Choice",
        body: [
          "Use Website Sucker when:",
        ],
        list: [
          "You're on Windows, Linux, or any non-Mac device",
          "The site uses modern JavaScript (Wix, Squarespace, Shopify, React, Vue, Angular, Next.js, etc.)",
          "It has lots of embedded videos, maps, or interactive content",
          "You want it done in 60 seconds without installing anything",
          "You're backing up a client's site and want to send them a clean ZIP without making them install software",
        ],
      },
      {
        heading: "The Bottom Line",
        body: [
          "Both tools have a place. SiteSucker is a solid app for Mac users with mostly static sites. Website Sucker is the modern, cross-platform, JS-aware alternative that handles today's web. Try Website Sucker free — if your site comes out clean, you're done. If you need more control, install SiteSucker.",
        ],
      },
    ],
    cta: {
      heading: "See How Your Site Looks in Website Sucker",
      body: "Paste your URL — analysing is free. You'll see exactly what we'd back up before deciding to download.",
    },
  },
  {
    slug: "how-to-save-a-website-as-a-zip-file",
    title: "How to Save a Website as a ZIP File (Complete Guide for 2026)",
    metaDescription:
      "Learn how to save any website as a single ZIP file — every page, image, stylesheet, and asset — that opens offline without an internet connection.",
    publishedDate: "April 2026",
    readingTime: "5 min read",
    category: "How-To Guides",
    intro:
      "Want to save a website as a ZIP file you can open later, share with a client, or store as a backup? Here's the simplest way to do it — works for any site, any device, no installs required.",
    sections: [
      {
        heading: "Why Save a Website as a ZIP?",
        body: [
          "A ZIP gives you a single, portable file containing the entire website — every page, image, stylesheet, font, and asset, organised in folders. You can:",
        ],
        list: [
          "Browse the site offline with no internet connection",
          "Email or share the entire site with a client or colleague",
          "Archive a project before a redesign or platform change",
          "Use it as a starting point for a new site rebuild",
          "Keep a snapshot of your portfolio or business as it looked at a specific date",
          "Comply with record-keeping requirements (contracts, legal disclosures, regulated industries)",
        ],
      },
      {
        heading: "Method 1: Use Website Sucker (Recommended for Most People)",
        body: [
          "This is the fastest way and works on any device:",
        ],
        list: [
          "Go to websitesucker.com",
          "Paste the URL of the website you want to save",
          "Click Start — analysing is free, watch the progress live",
          "When it finishes, click Download ZIP (credits from $1.30)",
          "You'll get a ZIP file like website-sucker-yoursite-com.zip",
          "Unzip it and open index.html in any browser to view the site offline",
        ],
      },
      {
        heading: "Method 2: Save a Single Page (Browser Built-In)",
        body: [
          "If you only need one page (not the whole site), every browser has a built-in option:",
        ],
        list: [
          "Open the page you want to save",
          "Right-click → Save Page As (or File → Save Page As)",
          "Choose Web Page, Complete to also save images and styles",
          "You'll get an HTML file plus a folder of assets — zip them yourself with right-click → Compress",
        ],
      },
      {
        heading: "Method 3: SiteSucker (Mac Only)",
        body: [
          "If you're on Mac and want a desktop app, SiteSucker can download a site to a folder. You'll need to manually compress that folder into a ZIP afterwards. SiteSucker doesn't render JavaScript, so it won't work well on modern Wix/Squarespace/React sites.",
        ],
      },
      {
        heading: "What Goes Inside the ZIP",
        body: [
          "A proper site ZIP should contain everything needed to view the site offline:",
        ],
        list: [
          "All HTML pages, organised by URL path (e.g. /about/index.html, /blog/index.html)",
          "All linked CSS stylesheets",
          "All JavaScript files",
          "Every image referenced on every page",
          "Custom fonts",
          "Embedded video/map iframes (preserved as live embeds when online)",
          "An index.html at the top level so you can just double-click to open it",
        ],
      },
      {
        heading: "Common Pitfalls to Avoid",
        body: [
          "A few things to watch out for when saving a site as a ZIP:",
        ],
        list: [
          "Tools that don't run JavaScript will miss most content on modern sites",
          "Some tools download files but don't rewrite links, so the offline copy has broken navigation",
          "Free tools sometimes have hidden size or page-count limits — check before relying on them for a big site",
          "Always verify the offline copy works before deleting the original — open the ZIP and click around",
        ],
      },
    ],
    cta: {
      heading: "Save Your Website as a ZIP in 60 Seconds",
      body: "Paste any URL — preview your first scrape free, then download the ZIP with a credit from $1.30. No install, no fuss.",
    },
  },
  {
    slug: "download-website-with-images-css-javascript",
    title: "How to Download a Website with Images, CSS, and JavaScript Intact",
    metaDescription:
      "Most website downloaders miss images, break stylesheets, or skip JavaScript. Here's how to download a website that actually works offline — fonts, embeds, and all.",
    publishedDate: "April 2026",
    readingTime: "6 min read",
    category: "How-To Guides",
    intro:
      "Anyone can save raw HTML. The hard part is downloading a website where every image still loads, every stylesheet still applies, every font still renders, and the layout actually looks like the original. Here's why most tools fail at this — and how to do it right.",
    sections: [
      {
        heading: "Why Most Downloads Look Broken Offline",
        body: [
          "When you save a webpage and it looks like a 1995 Geocities page when opened offline, one of these things has happened:",
        ],
        list: [
          "Images were referenced via JavaScript and the tool didn't run JS",
          "CSS files were loaded from a CDN that the tool didn't follow",
          "Fonts come from Google Fonts or Adobe Fonts and weren't downloaded",
          "Images are lazy-loaded on scroll and the tool never scrolled the page",
          "Image src attributes use relative paths that weren't rewritten to point to the local files",
          "Background images defined inside CSS files were ignored",
          "Modern image formats (WebP, AVIF) weren't recognised and got skipped",
        ],
      },
      {
        heading: "What a Complete Download Should Capture",
        body: [
          "For an offline copy that actually looks like the original, the downloader needs to handle all of this:",
        ],
        list: [
          "HTML for every page in the site",
          "Every <img> source, including srcset and lazy-loaded variants",
          "Every CSS file linked in <link> tags AND every @import inside those files",
          "Background images and url() references inside CSS",
          "Inline styles that reference images",
          "JavaScript files (so interactive features keep working)",
          "Fonts (TTF, WOFF, WOFF2)",
          "Favicons and Apple touch icons",
          "Modern formats: WebP, AVIF, SVG",
          "Embedded video and map iframes",
        ],
      },
      {
        heading: "How Website Sucker Handles It",
        body: [
          "Website Sucker uses a real headless Chrome browser to load each page exactly as a visitor would see it. That means JavaScript runs, dynamic content loads, lazy-loaded images get triggered (we scroll the page in 500-pixel increments to wake them up), and everything that ends up on screen gets captured.",
          "Then we walk every CSS file we downloaded looking for url() references and grab those too. Same with srcset attributes — we parse them, deduplicate variants of the same image, and download the highest-quality version.",
          "Finally, every reference in the HTML and CSS gets rewritten to point to the local file path. When you unzip the result and open index.html, everything works — no broken images, no missing fonts, no flat unstyled pages.",
        ],
      },
      {
        heading: "Edge Cases We Handle (That Most Tools Don't)",
        body: [
          "Real websites are messy. Here are some things we've had to specifically handle so downloads come out clean:",
        ],
        list: [
          "Wix CDN images served as AVIF with the wrong file extension — we normalise the URL and force the original PNG/JPEG",
          "Squarespace srcset variants of the same image — we deduplicate by base URL so we don't download 6 copies of one image",
          "<noscript> fallback images — we promote them into the DOM so they render offline",
          "<wix-iframe> custom elements — converted to standard iframes for offline playback",
          "Smooth-scroll anchor links — converted from data-anchor to proper hash links",
          "Lazy-loaded iframes (data-src) — activated so they show on first load",
          "Squarespace embed/video blocks — decoded from data-html attributes and inserted as live elements",
        ],
      },
      {
        heading: "Verifying Your Download",
        body: [
          "After you download a site, check the offline copy actually works:",
        ],
        list: [
          "Unzip the file",
          "Open index.html in your browser by double-clicking",
          "Click around to a few pages — they should all open and look correct",
          "Right-click → Inspect → Network tab → reload — there should be very few (or zero) failed requests",
          "Disconnect from the internet and reload — the site should still display (videos and maps will be the only thing needing connection)",
        ],
      },
    ],
    cta: {
      heading: "Download a Working Offline Copy",
      body: "Paste any URL — analysing is free. We'll show you exactly what we'd capture before you pay a cent.",
    },
  },
  {
    slug: "is-it-legal-to-download-a-website",
    title: "Is It Legal to Download a Website? A Plain-English Guide",
    metaDescription:
      "Is it legal to download or scrape a website? Here's a practical, non-lawyer explanation of when it's fine, when it's risky, and the common-sense rules that keep you safe.",
    publishedDate: "April 2026",
    readingTime: "7 min read",
    category: "Education",
    intro:
      "Lots of people want to download a website — to back up their own site, archive an article, or save something before it disappears. But is it actually legal? The short answer: usually yes, but it depends on what you're doing with it. Here's a plain-English breakdown of the rules.",
    sections: [
      {
        heading: "First, the Disclaimer",
        body: [
          "We're not lawyers and this isn't legal advice. Laws differ by country and individual circumstances matter. If you're doing something high-stakes, talk to an actual lawyer. What follows is the common-sense framework that covers most everyday situations.",
        ],
      },
      {
        heading: "The Single Most Important Question",
        body: [
          "When deciding whether downloading a site is OK, ask: am I downloading a public website that anyone with a browser can access?",
          "If yes, downloading it is generally fine. Your browser already downloads every page you visit — that's how the web works. A downloader just makes that copy more permanent and organised.",
          "If you're trying to bypass a paywall, log in to someone's account without permission, or access content that isn't publicly available, you're in different territory and the rules change.",
        ],
      },
      {
        heading: "When Downloading Is Almost Always Fine",
        body: [
          "These cases are essentially never an issue:",
        ],
        list: [
          "You're backing up your own website (you own the content and the copyright)",
          "You're archiving an article or page for personal reference",
          "You're capturing a snapshot of a site for record-keeping (e.g. proof of what was published on a certain date)",
          "You're a researcher saving public web content for a study",
          "You're a developer creating a local mirror of documentation to read offline",
          "You're migrating from one platform to another and need the source files",
        ],
      },
      {
        heading: "When You Should Be Careful",
        body: [
          "These don't mean it's illegal — but you should think twice and check the site's terms:",
        ],
        list: [
          "Downloading a competitor's site to clone their design — copyright applies to layouts, images, and copy",
          "Republishing downloaded content under your own name — this is straight-up copyright infringement",
          "Downloading paywalled content — if you bypassed a paywall, that's against most terms of service",
          "Hammering a site with a thousand requests per second — even if individual requests are legal, the load can violate computer-misuse laws",
          "Downloading personal data about other users (names, emails, etc.) — privacy laws like GDPR apply",
        ],
      },
      {
        heading: "Copyright vs. Access",
        body: [
          "There's a useful distinction here. Copyright governs what you can do with content (republish, sell, copy). Computer-access laws govern whether you can fetch the content in the first place.",
          "Downloading a public website doesn't usually violate access laws — that's just normal browsing, automated. But what you do with the downloaded content (republish it, claim it as yours, sell it) can violate copyright.",
          "Personal use, backup, archive, research — almost always fine. Republishing or commercial use of someone else's content — get permission first.",
        ],
      },
      {
        heading: "robots.txt and Terms of Service",
        body: [
          "Two things on every website that hint at what the owner wants:",
          "robots.txt is a file at the root of every site (e.g. example.com/robots.txt) that tells crawlers which pages they're welcome to fetch. It's not legally binding in most jurisdictions, but ignoring it is considered impolite and can be evidence in disputes.",
          "Terms of Service often have a clause about scraping or automated access. Whether these terms are enforceable varies by country — some courts enforce them strictly, others have ruled they don't apply to public pages. Either way, if a site explicitly forbids downloading and you do it anyway, you're on shakier ground.",
        ],
      },
      {
        heading: "Specific Common Cases",
        body: [
          "Backing up your own website built with Wix/Squarespace/Shopify: 100% fine. It's your content.",
          "Saving an article you want to read on a flight: fine, personal use.",
          "Archiving a competitor's pricing page so you can refer back to it: fine for personal/internal use, not for republication.",
          "Cloning someone's website to launch your own copy: not OK, this is copyright infringement.",
          "Downloading a publicly-available recipe or news article: fine for personal use, don't republish.",
          "Mass-downloading thousands of sites for a commercial database: tread carefully — talk to a lawyer.",
        ],
      },
      {
        heading: "What Website Sucker Does to Stay on the Right Side",
        body: [
          "We built Website Sucker to behave responsibly:",
        ],
        list: [
          "It throttles requests (~150ms between fetches) so it doesn't hammer servers",
          "It caps each download at a reasonable size (750 assets, 50 HTML pages) — enough for any normal site, not enough to abuse",
          "It blocks adult-content domains entirely",
          "It identifies itself in the user agent so site owners can see who's visiting",
          "It only downloads what's publicly accessible — no auth bypass, no paywall scraping",
          "Files are auto-deleted from our servers 10 minutes after the scrape — we don't keep copies of your downloads",
        ],
      },
      {
        heading: "The Bottom Line",
        body: [
          "Downloading a public website for personal use, backup, archive, or migration is almost always legal and ethical. Republishing someone else's content, cloning their design, or hammering their server is not.",
          "If your situation is high-stakes (commercial scraping, regulatory compliance, anything competitive), talk to a lawyer. For everyone else, common sense covers it.",
        ],
      },
    ],
    cta: {
      heading: "Back Up Your Site With Confidence",
      body: "Website Sucker is designed for legitimate, polite, personal-use backups. Paste your URL, preview free, and download with a credit from $1.30.",
    },
  },
];
