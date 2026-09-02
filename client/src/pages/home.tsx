import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { AlertCircle } from "lucide-react";
import { WsLogo } from "@/components/logo";
import { CrawlPanel } from "@/components/crawl-panel";
import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth, refreshAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UrlInputForm } from "@/components/url-input-form";
import {
  PlatformStrip,
  HowItWorks,
  WhatYouGet,
  Credibility,
  Pricing,
  CtaBand,
  SiteFooter,
} from "@/components/landing";
import { ProgressDisplay } from "@/components/progress-display";
import { ResultsSummary } from "@/components/results-summary";
import { PricingDialog } from "@/components/pricing-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSeo, softwareApplicationSchema } from "@/lib/seo";
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
  // A URL handed in from a landing page via ?url= — read once on mount.
  const [incomingUrl] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("url") || "";
    } catch {
      return "";
    }
  });
  const autoStartedRef = useRef(false);

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
      softwareApplicationSchema,
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

  // Auto-start a scrape when a landing page handed in a URL (?url=). Runs once,
  // after auth is known, then clears the query string. For signed-out visitors
  // handleSubmit routes to sign-up, exactly like a manual submit.
  useEffect(() => {
    if (!incomingUrl || autoStartedRef.current || authLoading) return;
    autoStartedRef.current = true;
    try {
      window.history.replaceState({}, "", "/");
    } catch {
      /* ignore */
    }
    handleSubmit({ url: incomingUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingUrl, authLoading]);

  const handleDownload = async () => {
    if (!currentJob) return;

    // Credit and subscription scrapes include the download. Free scrapes
    // don't — the server charges a credit at download time, and returns 402
    // if the account has none.
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/scrape/${currentJob.id}/download`, {
        method: "POST",
      });
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
      {viewState !== "input" && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <AccountMenu />
          <ThemeToggle />
        </div>
      )}
      {viewState === "input" && (
        <div className="min-h-screen flex flex-col bg-ws-paper">
          {/* Dark hero — blueprint grid + blue glow, live crawl on the right */}
          <div className="relative overflow-hidden bg-ws-ink text-ws-paper">
            <div aria-hidden className="ws-hero-grid pointer-events-none absolute inset-0" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-48 -left-40 h-[38rem] w-[38rem] rounded-full bg-primary/25 blur-[130px]"
            />

            <header className="relative z-10 border-b border-ws-graphite">
              <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                <div className="flex items-center gap-8">
                  <WsLogo markClassName="h-6 w-auto" invert />
                  <nav className="hidden items-center gap-8 md:flex">
                    <a href="#how" className="text-sm text-ws-mist transition-colors hover:text-ws-paper">How it works</a>
                    <a href="#what" className="text-sm text-ws-mist transition-colors hover:text-ws-paper">What you get</a>
                    <a href="#pricing" className="text-sm text-ws-mist transition-colors hover:text-ws-paper">Pricing</a>
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
                  Backup · Archive · Migrate
                </p>
                <h1 className="mb-5 text-[2.75rem] font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
                  Take the whole site with you.
                </h1>
                <p className="mb-8 max-w-xl text-lg leading-relaxed text-ws-mist">
                  Paste a URL. Watch every page, image, stylesheet, script and font get pulled
                  down in real time. Pay only if you want the ZIP.
                </p>

                {lastError && (
                  <Alert variant="destructive" className="mb-6 max-w-2xl w-full" data-testid="alert-scrape-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Couldn't scrape that site</AlertTitle>
                    <AlertDescription data-testid="text-scrape-error">{lastError}</AlertDescription>
                  </Alert>
                )}

                <UrlInputForm onSubmit={handleSubmit} isLoading={isLoading} tone="dark" defaultUrl={incomingUrl} />

                <p className="ws-label mt-4 text-ws-steel">
                  No install · Any OS · ~2 min average · JS-rendered pages included
                </p>
              </div>

              <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
                <CrawlPanel />
              </div>
            </div>
          </div>

          <PlatformStrip />

          <div id="how"><HowItWorks /></div>

          <div id="what"><WhatYouGet /></div>

          <div id="proof"><Credibility /></div>

          <div id="pricing">
            <Pricing onStart={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
          </div>

          <CtaBand onStart={() => window.scrollTo({ top: 0, behavior: "smooth" })} />

          <SiteFooter />
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
