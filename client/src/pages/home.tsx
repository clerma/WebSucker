import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Globe, ArrowDown, Zap, Shield, FolderOpen, Lock, AlertCircle } from "lucide-react";
import { useAuth, refreshAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UrlInputForm } from "@/components/url-input-form";
import { Reveal } from "@/components/reveal";
import { ProgressDisplay } from "@/components/progress-display";
import { ResultsSummary } from "@/components/results-summary";
import { PricingDialog } from "@/components/pricing-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import type {
  Asset,
  ScrapeJob,
  ScrapeProgress,
  StartScrapeInput,
} from "@shared/schema";

type ViewState = "input" | "scraping" | "results";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("input");
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentJob, setCurrentJob] = useState<ScrapeJob | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showPricing, setShowPricing] = useState(false);
  const [progress, setProgress] = useState<ScrapeProgress>({
    jobId: "",
    status: "idle",
    totalAssets: 0,
    processedAssets: 0,
    successfulAssets: 0,
    failedAssets: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const scrapeCompletedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useSeo({
    title: "Website Sucker — Back Up, Archive & Transfer Any Website Online",
    description:
      "Website Sucker is a free online tool to back up, archive, and transfer any website. Paste a URL and download a complete offline copy — HTML, CSS, JS, images, and fonts — in minutes. First scrape free to preview; downloads from $1.99 (packs from $1.30/credit) or $5.99/mo unlimited.",
    canonicalPath: "/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is Website Sucker?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Website Sucker is a free online tool to back up, archive, and transfer any website. It downloads a site as a complete offline copy — every page, image, stylesheet, JavaScript file, and font — packaged into a single ZIP. There's nothing to install; your first scrape is free to preview and ZIP downloads start at $1.99 for a single credit (packs from $1.30/credit).",
            },
          },
          {
            "@type": "Question",
            name: "How do I back up a website?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "To back up a website with Website Sucker, paste the site's URL, let it analyse every page and asset for free, then download the complete offline copy as a ZIP with a credit (from $1.99, packs from $1.30/credit) — your first scrape is free to preview. The backup includes all HTML, CSS, JavaScript, images, and fonts, and opens in any browser without an internet connection.",
            },
          },
          {
            "@type": "Question",
            name: "How do I archive a website?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Archive a website by downloading a full offline snapshot you can keep forever. Website Sucker captures every page exactly as it renders — including JavaScript-heavy sites like Wix and Squarespace — so your archive stays usable even if the live site changes or goes offline.",
            },
          },
          {
            "@type": "Question",
            name: "How do I transfer a website to a new platform?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "To transfer a website, download a complete copy of its HTML, CSS, JavaScript, images, and fonts with Website Sucker, then upload those files to your new host or use them as a reference when rebuilding on a new platform like WordPress, Webflow, or Shopify.",
            },
          },
          {
            "@type": "Question",
            name: "What free tools can back up a website?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Website Sucker is free to analyse any website and lets you preview your first scrape free, with ZIP downloads from $1.99 (packs from $1.30/credit). Unlike older desktop tools such as SiteSucker (Mac-only) or HTTrack, it runs in any browser on Windows, Linux, Mac, or Chromebook and renders JavaScript-heavy modern sites with a real headless browser.",
            },
          },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to back up a website",
        description:
          "Back up, archive, or transfer any website online with Website Sucker in three steps.",
        totalTime: "PT3M",
        estimatedCost: {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: "0",
        },
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Enter the website URL",
            text: "Paste the address of the website you want to back up into Website Sucker. Create a free account — your first scrape is free to preview.",
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Review every asset",
            text: "Website Sucker scans the site and lists every page, image, stylesheet, script, and font it found, so you can confirm the backup before paying.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Download the offline copy",
            text: "Download a single organised ZIP with a credit — from $1.99, packs from $1.30/credit (or unlimited at $5.99/month). Unzip it and the whole website opens offline in any browser.",
          },
        ],
      },
    ],
  });

  useEffect(() => {
    // Resume any in-progress scrape that survived a page refresh or crash.
    const savedJob = localStorage.getItem("websitesucker_active_job");
    if (savedJob) {
      try {
        const { jobId } = JSON.parse(savedJob);
        fetch(`/api/scrape/${jobId}`)
          .then((r) => r.json())
          .then((job: ScrapeJob) => {
            if (job.status === "scraping") {
              scrapeCompletedRef.current = false;
              reconnectAttemptsRef.current = 0;
              setCurrentJob(job);
              setProgress({
                jobId: job.id,
                status: "scraping",
                totalAssets: job.totalAssets,
                processedAssets: job.processedAssets,
                successfulAssets: job.successfulAssets,
                failedAssets: job.failedAssets,
                message: "Resuming…",
              });
              setAssets(job.assets);
              setViewState("scraping");
              setIsLoading(false);
              connectWebSocket(job.id);
            } else if (job.status === "completed") {
              scrapeCompletedRef.current = true;
              setCurrentJob(job);
              setAssets(job.assets);
              setViewState("results");
              localStorage.removeItem("websitesucker_active_job");
            } else {
              // failed or unknown — clear the stale entry
              localStorage.removeItem("websitesucker_active_job");
            }
          })
          .catch(() => {
            localStorage.removeItem("websitesucker_active_job");
          });
      } catch {
        localStorage.removeItem("websitesucker_active_job");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MAX_RECONNECT_ATTEMPTS = 5;

  const connectWebSocket = useCallback(
    (jobId: string) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: "subscribe", jobId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "progress") {
            setProgress(data.progress);
          }

          if (data.type === "asset") {
            setAssets((prev) => {
              const existing = prev.findIndex((a) => a.id === data.asset.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = data.asset;
                return updated;
              }
              return [...prev, data.asset];
            });
          }

          if (data.type === "complete") {
            scrapeCompletedRef.current = true;
            localStorage.removeItem("websitesucker_active_job");
            setCurrentJob(data.job);
            setViewState("results");
            setIsLoading(false);
            ws.close();
          }

          if (data.type === "error") {
            scrapeCompletedRef.current = true;
            localStorage.removeItem("websitesucker_active_job");
            setLastError(data.message || "Scraping failed");
            toast({
              title: "Scraping Error",
              description: data.message,
              variant: "destructive",
            });
            setIsLoading(false);
            setViewState("input");
            ws.close();
          }

        } catch (err) {
          console.error("WebSocket message error:", err);
        }
      };

      ws.onerror = () => { /* handled in onclose */ };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (scrapeCompletedRef.current) return;
        if (event.code === 1000 || event.code === 1001) return;

        // Poll the REST API first — the server may have finished the job
        // just before the connection dropped (common race condition).
        fetch(`/api/scrape/${jobId}`)
          .then((r) => r.json())
          .then((job: ScrapeJob) => {
            if (job.status === "completed") {
              scrapeCompletedRef.current = true;
              setCurrentJob(job);
              setViewState("results");
              setIsLoading(false);
              return;
            }
            if (job.status === "failed") {
              // Server already finalized this as failed — surface message once and stop.
              scrapeCompletedRef.current = true;
              localStorage.removeItem("websitesucker_active_job");
              setLastError(job.errorMessage || "Scraping failed");
              toast({
                title: "Scraping Error",
                description: job.errorMessage || "Scraping failed",
                variant: "destructive",
              });
              setIsLoading(false);
              setViewState("input");
              return;
            }
            // Job still running — attempt to reconnect with exponential backoff.
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              const attempt = ++reconnectAttemptsRef.current;
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
              reconnectTimerRef.current = setTimeout(() => {
                connectWebSocket(jobId);
              }, delay);
            } else {
              toast({
                title: "Connection Lost",
                description: "Couldn't reconnect to the scraper. Please try again.",
                variant: "destructive",
              });
              setIsLoading(false);
              setViewState("input");
            }
          })
          .catch(() => {
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              const attempt = ++reconnectAttemptsRef.current;
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
              reconnectTimerRef.current = setTimeout(() => {
                connectWebSocket(jobId);
              }, delay);
            } else {
              toast({
                title: "Connection Lost",
                description: "Couldn't reconnect to the scraper. Please try again.",
                variant: "destructive",
              });
              setIsLoading(false);
              setViewState("input");
            }
          });
      };
    },
    [toast]
  );

  const handleSubmit = async (data: StartScrapeInput) => {
    // Scraping requires an account — send new visitors to sign up (first scrape is free).
    if (!authLoading && !user) {
      toast({
        title: "Create a free account",
        description: "Sign up in seconds and your first scrape is free.",
      });
      navigate("/auth");
      return;
    }

    scrapeCompletedRef.current = false;
    reconnectAttemptsRef.current = 0;
    setLastError(null);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setIsLoading(true);
    setAssets([]);
    setProgress({
      jobId: "",
      status: "scraping",
      totalAssets: 0,
      processedAssets: 0,
      successfulAssets: 0,
      failedAssets: 0,
      message: "Starting scrape...",
    });
    setViewState("scraping");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.status === 401) {
        setIsLoading(false);
        setViewState("input");
        toast({
          title: "Please sign in",
          description: "Create a free account — your first scrape is free.",
        });
        navigate("/auth");
        return;
      }

      if (response.status === 402) {
        setIsLoading(false);
        setViewState("input");
        setShowPricing(true);
        return;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start scrape");
      }

      const job: ScrapeJob = await response.json();
      setCurrentJob(job);
      setProgress((prev) => ({ ...prev, jobId: job.id }));
      localStorage.setItem("websitesucker_active_job", JSON.stringify({ jobId: job.id }));
      connectWebSocket(job.id);
      refreshAuth(); // credit balance may have changed
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start scrape",
        variant: "destructive",
      });
      setIsLoading(false);
      setViewState("input");
    }
  };

  const handleDownload = async () => {
    if (!currentJob) return;

    // Credit and subscription scrapes include the download. Free scrapes
    // don't — the server charges a credit at download time, and returns 402
    // if the account has none.
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/scrape/${currentJob.id}/download`);
      if (response.status === 402) {
        toast({
          title: "Download requires a credit",
          description: "Your free scrape lets you preview the results. Buy a credit pack or subscribe to download the ZIP.",
        });
        setShowPricing(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `website-sucker-${new URL(currentJob.url).hostname}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download Started",
        description: "Your website backup is downloading.",
      });
      // A credit may have been spent at download time — refresh the balance.
      refreshAuth();
    } catch (err) {
      toast({
        title: "Download Failed",
        description: "Could not download the backup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleNewScrape = () => {
    localStorage.removeItem("websitesucker_active_job");
    setViewState("input");
    setCurrentJob(null);
    setAssets([]);
    setProgress({
      jobId: "",
      status: "idle",
      totalAssets: 0,
      processedAssets: 0,
      successfulAssets: 0,
      failedAssets: 0,
    });
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen">
      {viewState === "input" && (
        <div className="min-h-screen flex flex-col">
          <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
            {/* Animated aurora backdrop */}
            <div aria-hidden className="absolute inset-0 overflow-hidden">
              <div className="hero-aurora animate-aurora bg-primary/25 dark:bg-primary/20 w-[38rem] h-[38rem] -top-40 -left-24" />
              <div
                className="hero-aurora animate-aurora bg-chart-4/20 w-[30rem] h-[30rem] top-10 -right-24"
                style={{ animationDelay: "-7s" }}
              />
              <div
                className="hero-aurora animate-aurora bg-chart-2/10 w-[26rem] h-[26rem] bottom-0 left-1/3"
                style={{ animationDelay: "-13s" }}
              />
            </div>

            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="text-center mb-10 max-w-2xl">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-6 animate-fade-up animate-float shadow-lg shadow-primary/5">
                  <Globe className="h-8 w-8 text-primary" />
                </div>

                <h1
                  className="text-4xl md:text-5xl font-bold tracking-tight mb-4 animate-fade-up"
                  style={{ animationDelay: "80ms" }}
                >
                  <span className="text-gradient-animate">Website Sucker</span>
                </h1>
                <p
                  className="text-lg text-muted-foreground max-w-lg mx-auto animate-fade-up"
                  style={{ animationDelay: "160ms" }}
                >
                  The free online tool to back up, archive, and transfer any website.
                  No app to install, no OS restrictions — just paste a URL and download
                  a complete offline copy.
                </p>
              </div>

              {lastError && (
                <Alert variant="destructive" className="mb-6 max-w-xl w-full" data-testid="alert-scrape-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Couldn't scrape that site</AlertTitle>
                  <AlertDescription data-testid="text-scrape-error">{lastError}</AlertDescription>
                </Alert>
              )}

              <div className="w-full animate-fade-up" style={{ animationDelay: "240ms" }}>
                <UrlInputForm onSubmit={handleSubmit} isLoading={isLoading} />
              </div>

              <div
                className="mt-16 flex items-center gap-2 text-muted-foreground animate-fade-up"
                style={{ animationDelay: "360ms" }}
              >
                <ArrowDown className="h-4 w-4 animate-bounce" />
                <span className="text-sm">See how it works</span>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 border-t py-16 px-4">
            <div className="max-w-4xl mx-auto">
              <Reveal>
                <h2 className="text-2xl font-semibold text-center mb-10">
                  How It Works
                </h2>
              </Reveal>
              <div className="grid md:grid-cols-3 gap-8">
                <Reveal delay={0}>
                  <FeatureCard
                    icon={Globe}
                    title="1. Create a Free Account"
                    description="Sign up in seconds and preview your first scrape free — no card required."
                  />
                </Reveal>
                <Reveal delay={120}>
                  <FeatureCard
                    icon={Zap}
                    title="2. Paste Any URL"
                    description="We scan and capture every asset — HTML, CSS, JS, images, fonts, and more."
                  />
                </Reveal>
                <Reveal delay={240}>
                  <FeatureCard
                    icon={Lock}
                    title="3. Download Your Backup"
                    description="Download the full ZIP with a credit — from $1.99 — or go unlimited for $5.99/month."
                  />
                </Reveal>
              </div>
            </div>
          </div>

          <div className="py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <Reveal>
                <h2 className="text-2xl font-semibold text-center mb-10">
                  What Gets Downloaded
                </h2>
              </Reveal>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Reveal delay={0}>
                  <AssetTypeCard label="HTML Pages" icon="html" />
                </Reveal>
                <Reveal delay={80}>
                  <AssetTypeCard label="CSS Styles" icon="css" />
                </Reveal>
                <Reveal delay={160}>
                  <AssetTypeCard label="JavaScript" icon="js" />
                </Reveal>
                <Reveal delay={240}>
                  <AssetTypeCard label="Images" icon="image" />
                </Reveal>
              </div>
              <p className="text-center text-sm text-muted-foreground mt-6">
                Including CDN assets, background images, fonts, and embedded
                resources
              </p>
            </div>
          </div>

          <div className="border-t py-16 px-4">
            <div className="max-w-3xl mx-auto">
              <Reveal>
                <h2 className="text-2xl font-semibold text-center mb-4">
                  What is Website Sucker?
                </h2>
                <p className="text-muted-foreground leading-relaxed text-center max-w-2xl mx-auto">
                  Website Sucker is a free online tool to <strong className="text-foreground font-medium">back up, archive, and transfer any website</strong>.
                  Paste a URL and it downloads a complete offline copy — every page, image, stylesheet,
                  JavaScript file, and font — packaged into a single ZIP that opens in any browser.
                  There's nothing to install, and analysing is always free.
                </p>
              </Reveal>

              <div className="grid sm:grid-cols-3 gap-4 mt-10">
                <Reveal delay={0}>
                  <div className="rounded-xl border bg-card p-5 h-full transition-transform duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/40">
                    <h3 className="font-semibold mb-1.5">Back up a website</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Keep a complete, offline copy of any site — pages, images, styles, and scripts included.
                    </p>
                  </div>
                </Reveal>
                <Reveal delay={120}>
                  <div className="rounded-xl border bg-card p-5 h-full transition-transform duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/40">
                    <h3 className="font-semibold mb-1.5">Archive a website</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Preserve a snapshot that stays usable even if the live site changes or goes offline.
                    </p>
                  </div>
                </Reveal>
                <Reveal delay={240}>
                  <div className="rounded-xl border bg-card p-5 h-full transition-transform duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/40">
                    <h3 className="font-semibold mb-1.5">Transfer a website</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Move the HTML, CSS, JS, images, and fonts to a new host or platform with no lock-in.
                    </p>
                  </div>
                </Reveal>
              </div>

              <p className="text-center text-sm text-muted-foreground mt-8">
                Works on Squarespace, Wix, WordPress, Webflow, Shopify, and custom sites — in any browser on
                Windows, Linux, Mac, or Chromebook. A cross-platform{" "}
                <a href="/blog/website-sucker-vs-sitesucker" className="underline underline-offset-2 hover:text-foreground">SiteSucker alternative</a>{" "}
                that runs entirely online.
              </p>
            </div>
          </div>

          <div className="bg-muted/50 border-t py-12 px-4">
            <div className="max-w-4xl mx-auto flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span className="text-sm">
                  Your first scrape is free. Your data stays private. Files are deleted 10 minutes after scraping.
                </span>
              </div>
              <div className="flex items-center gap-4 flex-wrap justify-center">
                <a
                  href="/features"
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  data-testid="link-features"
                >
                  Features
                </a>
                <a
                  href="/faq"
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  data-testid="link-faq"
                >
                  FAQ
                </a>
                <a
                  href="/blog"
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  data-testid="link-blog"
                >
                  Help &amp; Guides
                </a>
                <a
                  href="/terms"
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Terms &amp; Conditions
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewState === "scraping" && (
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
          <ProgressDisplay progress={progress} assets={assets} />
        </div>
      )}

      {viewState === "results" && currentJob && (
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
          <ResultsSummary
            job={currentJob}
            onDownload={handleDownload}
            onNewScrape={handleNewScrape}
            isDownloading={isDownloading}
            onExpired={() => {
              toast({
                title: "Session expired",
                description: "Your scraped files have been deleted. Scrape the site again to get a fresh copy.",
                variant: "destructive",
              });
              handleNewScrape();
            }}
          />
        </div>
      )}

      <PricingDialog
        open={showPricing}
        onOpenChange={setShowPricing}
        jobId={currentJob?.id}
        onAccessGranted={handleDownload}
      />
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Globe;
  title: string;
  description: string;
}) {
  return (
    <div className="group text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary/15">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function AssetTypeCard({ label, icon }: { label: string; icon: string }) {
  const iconColors: Record<string, string> = {
    html: "bg-orange-500/10 text-orange-500",
    css: "bg-blue-500/10 text-blue-500",
    js: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    image: "bg-green-500/10 text-green-500",
  };

  return (
    <div className="group p-4 rounded-lg bg-card border text-center h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/40">
      <div
        className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3 transition-transform duration-300 group-hover:scale-110 ${iconColors[icon]}`}
      >
        <span className="font-mono text-xs font-bold uppercase">{icon}</span>
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
