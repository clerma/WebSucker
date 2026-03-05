import { useState, useEffect, useRef, useCallback } from "react";
import { Globe, ArrowDown, Zap, Shield, FolderOpen } from "lucide-react";
import { UrlInputForm } from "@/components/url-input-form";
import { ProgressDisplay } from "@/components/progress-display";
import { ResultsSummary } from "@/components/results-summary";
import { PricingDialog } from "@/components/pricing-dialog";
import { useToast } from "@/hooks/use-toast";
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentJob, setCurrentJob] = useState<ScrapeJob | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showPricing, setShowPricing] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [progress, setProgress] = useState<ScrapeProgress>({
    jobId: "",
    status: "idle",
    totalAssets: 0,
    processedAssets: 0,
    successfulAssets: 0,
    failedAssets: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const customerId = localStorage.getItem("websucker_customer_id");
    if (customerId) {
      fetch(`/api/stripe/check-subscription?customer_id=${customerId}`)
        .then((res) => res.json())
        .then((data) => {
          setHasActiveSubscription(data.active);
        })
        .catch(() => {});
    }
  }, []);

  const connectWebSocket = useCallback(
    (jobId: string) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
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
            setCurrentJob(data.job);
            setViewState("results");
            setIsLoading(false);
            ws.close();
          }

          if (data.type === "error") {
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

      ws.onerror = () => {
        toast({
          title: "Connection Error",
          description: "Lost connection to the server. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        setViewState("input");
      };

      ws.onclose = () => {
        wsRef.current = null;
      };
    },
    [toast]
  );

  const handleSubmit = async (data: StartScrapeInput) => {
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start scrape");
      }

      const job: ScrapeJob = await response.json();
      setCurrentJob(job);
      setProgress((prev) => ({ ...prev, jobId: job.id }));
      connectWebSocket(job.id);
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

    if (hasActiveSubscription) {
      const customerId = localStorage.getItem("websucker_customer_id");
      setIsDownloading(true);
      try {
        const authResponse = await fetch("/api/stripe/authorize-subscriber-download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, jobId: currentJob.id }),
        });
        const authData = await authResponse.json();

        if (!authData.authorized) {
          setHasActiveSubscription(false);
          localStorage.removeItem("websucker_is_subscriber");
          setShowPricing(true);
          setIsDownloading(false);
          return;
        }

        const response = await fetch(`/api/scrape/${currentJob.id}/download`);
        if (!response.ok) {
          throw new Error("Download failed");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${new URL(currentJob.url).hostname}-backup.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Download Started",
          description: "Your website backup is downloading.",
        });
      } catch (err) {
        toast({
          title: "Download Failed",
          description: "Could not download the backup. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsDownloading(false);
      }
    } else {
      setShowPricing(true);
    }
  };

  const handleNewScrape = () => {
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
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
            <div className="text-center mb-10 max-w-2xl">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                WebSucker
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                Download complete websites for offline viewing. Perfect for CMS
                migrations and website backups.
              </p>
            </div>

            <UrlInputForm onSubmit={handleSubmit} isLoading={isLoading} />

            <div className="mt-16 flex items-center gap-2 text-muted-foreground">
              <ArrowDown className="h-4 w-4 animate-bounce" />
              <span className="text-sm">See how it works</span>
            </div>
          </div>

          <div className="bg-muted/50 border-t py-16 px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold text-center mb-10">
                How It Works
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                <FeatureCard
                  icon={Globe}
                  title="Enter URL"
                  description="Paste the website URL you want to backup or migrate"
                />
                <FeatureCard
                  icon={Zap}
                  title="Smart Scraping"
                  description="We extract HTML, CSS, JS, images, and more automatically"
                />
                <FeatureCard
                  icon={FolderOpen}
                  title="Download & Use"
                  description="Get organized files that work offline without internet"
                />
              </div>
            </div>
          </div>

          <div className="py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold text-center mb-10">
                What Gets Downloaded
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <AssetTypeCard label="HTML Pages" icon="html" />
                <AssetTypeCard label="CSS Styles" icon="css" />
                <AssetTypeCard label="JavaScript" icon="js" />
                <AssetTypeCard label="Images" icon="image" />
              </div>
              <p className="text-center text-sm text-muted-foreground mt-6">
                Including CDN assets, background images, fonts, and embedded
                resources
              </p>
            </div>
          </div>

          <div className="bg-muted/50 border-t py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span className="text-sm">
                  Your data stays private. Files are deleted after download.
                </span>
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
          />
          <PricingDialog
            open={showPricing}
            onOpenChange={setShowPricing}
            jobId={currentJob.id}
          />
        </div>
      )}
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
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
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
    <div className="p-4 rounded-lg bg-card border text-center">
      <div
        className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3 ${iconColors[icon]}`}
      >
        <span className="font-mono text-xs font-bold uppercase">{icon}</span>
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
