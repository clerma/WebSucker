import { useEffect, useRef, useState } from "react";
import {
  FileCode,
  FileText,
  Image,
  FileType,
  File,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  SkipForward,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Asset, AssetType, AssetStatus, ScrapeProgress } from "@shared/schema";

const assetTypeIcons: Record<AssetType, typeof FileCode> = {
  html: FileText,
  css: FileCode,
  js: FileCode,
  image: Image,
  font: FileType,
  other: File,
};

const assetTypeLabels: Record<AssetType, string> = {
  html: "HTML",
  css: "CSS",
  js: "JavaScript",
  image: "Image",
  font: "Font",
  other: "Other",
};

const statusIcons: Record<AssetStatus, typeof CheckCircle2> = {
  pending: Clock,
  downloading: Loader2,
  success: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
};

const statusColors: Record<AssetStatus, string> = {
  pending: "text-muted-foreground",
  downloading: "text-primary animate-spin",
  success: "text-green-500",
  failed: "text-destructive",
  skipped: "text-yellow-500",
};

const phaseLabels = {
  pages: "Pages first",
  code: "Shared code",
  media: "Images & media",
  finalizing: "Finalizing ZIP",
} as const;

interface ProgressDisplayProps {
  progress: ScrapeProgress;
  assets: Asset[];
}

export function ProgressDisplay({ progress, assets }: ProgressDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isTakingLonger, setIsTakingLonger] = useState(false);
  const progressPercent =
    progress.totalAssets > 0
      ? Math.round((progress.processedAssets / progress.totalAssets) * 100)
      : 0;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [assets]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsTakingLonger(true), 60_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-lg font-semibold">
              Scraping Progress
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" data-testid="badge-total-assets">
                {progress.totalAssets} total
              </Badge>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                data-testid="badge-success-count"
              >
                {progress.successfulAssets} success
              </Badge>
              <Badge
                variant="outline"
                className="bg-destructive/10 text-destructive border-destructive/20"
                data-testid="badge-failed-count"
              >
                {progress.failedAssets} failed
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {progress.truncated && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm" data-testid="alert-scrape-truncated">
              <div className="mb-1 flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Large site — preparing a partial backup
              </div>
              <p className="text-muted-foreground">
                A crawl safety limit was reached. We are keeping everything captured so far and downloading all remaining queued files.
              </p>
            </div>
          )}
          {progress.phase && (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              data-testid="scrape-phase-summary"
              aria-live="polite"
            >
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Current phase</p>
                <p className="mt-1 text-sm font-medium">{phaseLabels[progress.phase]}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Batch</p>
                <p className="mt-1 text-sm font-medium">{progress.batchNumber ?? 1}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Pages saved</p>
                <p className="mt-1 text-sm font-medium">{progress.pagesProcessed ?? 0}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Waiting</p>
                <p className="mt-1 text-sm font-medium">{progress.pendingAssets ?? 0}</p>
              </div>
            </div>
          )}
          {isTakingLonger && !progress.truncated && (
            <div
              className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm"
              data-testid="notice-scrape-taking-longer"
              role="status"
              aria-live="polite"
            >
              <div className="mb-1 flex items-center gap-2 font-medium text-sky-700 dark:text-sky-300">
                <Clock className="h-4 w-4" />
                This site is taking longer than average
              </div>
              <p className="text-muted-foreground">
                Large sites and sites with many pages, high-resolution images, or JavaScript-loaded content can take several minutes. The scrape is still running—there is no need to refresh this page.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                {progress.message || "Processing..."}
              </span>
              <span className="font-mono font-medium" data-testid="text-progress-percent">
                {progressPercent}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-2 [&>div]:bg-ws-cyan" data-testid="progress-bar" />
          </div>

          <div className="pt-2">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Activity Log
            </h4>
            <ScrollArea className="h-64 rounded-md border bg-muted/30">
              <div
                ref={scrollRef}
                className="p-3 space-y-1 custom-scrollbar"
              >
                {assets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <p className="text-sm">Starting up — this may take a few seconds…</p>
                  </div>
                ) : (
                  assets.map((asset) => {
                    const TypeIcon = assetTypeIcons[asset.type];
                    const StatusIcon = statusIcons[asset.status];
                    const statusColor = statusColors[asset.status];

                    return (
                      <div
                        key={asset.id}
                        className="flex items-center gap-2 py-1.5 px-2 rounded text-sm hover:bg-muted/50 transition-colors"
                        data-testid={`asset-row-${asset.id}`}
                      >
                        <StatusIcon className={`h-4 w-4 flex-shrink-0 ${statusColor}`} />
                        <TypeIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {assetTypeLabels[asset.type]}
                        </span>
                        <span className="truncate flex-1 font-mono text-xs text-foreground/80">
                          {asset.originalUrl}
                        </span>
                        {asset.size && asset.status === "success" && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatBytes(asset.size)}
                          </span>
                        )}
                        {asset.error && (
                          <span className="text-xs text-destructive truncate max-w-[200px]">
                            {asset.error}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
