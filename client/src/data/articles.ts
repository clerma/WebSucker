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
          "Click Download ZIP for $1.99 and you'll receive a complete offline backup",
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
          "Click Download ZIP for $1.99 to get your complete offline backup",
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
      body: "Just paste your published Wix URL. Analysing is free — no account needed. Download the complete ZIP for $1.99.",
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
          "Click Download ZIP for $1.99 to get the complete offline backup",
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
      body: "Paste any URL and get a complete offline backup. Analysing is free. Download starts at $1.99.",
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
          "Website Sucker crawls any public website and packages every page, image, stylesheet, and file into a single downloadable ZIP — for $1.99 per backup. That's it. One URL, one payment, one offline copy that works in any browser without internet.",
        ],
      },
    ],
    cta: {
      heading: "Don't Wait Until Something Goes Wrong",
      body: "Back up your site today. Analysing is free — you only pay $1.99 when you want to download the complete offline copy.",
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
          "Click Download ZIP for $1.99 to get everything",
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
      body: "Paste any URL and see every image on your site for free. Download the complete set in a single ZIP for $1.99.",
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
      body: "Before you transfer anything, download a complete offline copy of your current site. Analysing is free — download the full ZIP for $1.99.",
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
      body: "Paste any URL and get a fully converted static version of your site. Analysing is free — the complete download is $1.99.",
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
          "Just two things: your website's URL and a browser. No software to download, no account to create, no technical knowledge required.",
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
        heading: "Step 3 — Download Your Backup ($1.99)",
        body: [
          "Once the scan is complete, click Download ZIP. A one-time payment of $1.99 unlocks the download. You'll receive a single ZIP file containing every page and asset from your site, organised into a clean folder structure.",
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
          "At $1.99 per backup, it's one of the cheapest insurance policies you can buy for your online presence.",
        ],
      },
    ],
    cta: {
      heading: "Back Up Your Site Right Now",
      body: "Paste your URL, scan for free, and download the complete backup for $1.99. Done in under 60 seconds.",
    },
  },
];
