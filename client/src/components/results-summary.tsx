import { useState, useEffect, useRef } from "react";
import {
  FileCode,
  FileText,
  Image,
  FileType,
  File,
  CheckCircle2,
  XCircle,
  Download,
  AlertTriangle,
  ExternalLink,
  SkipForward,
  RefreshCw,
  Lock,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Asset, AssetType, ScrapeJob } from "@shared/schema";

const assetTypeIcons: Record<AssetType, typeof FileCode> = {
  html: FileText,
  css: FileCode,
  js: FileCode,
  image: Image,
  font: FileType,
  other: File,
};

const assetTypeLabels: Record<AssetType, string> = {
  html: "HTML Pages",
  css: "Stylesheets",
  js: "Scripts",
  image: "Images",
  font: "Fonts",
  other: "Other Files",
};

function useCountdown(expiresAt: string | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [expiresAt]);

  return secondsLeft;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ResultsSummaryProps {
  job: ScrapeJob;
  onDownload: () => void;
  onNewScrape: () => void;
  onExpired: () => void;
  isDownloading: boolean;
}

export function ResultsSummary({
  job,
  onDownload,
  onNewScrape,
  onExpired,
  isDownloading,
}: ResultsSummaryProps) {
  const successAssets = job.assets.filter((a) => a.status === "success");
  const failedAssets = job.assets.filter((a) => a.status === "failed");
  const skippedAssets = job.assets.filter((a) => a.status === "skipped");
  const secondsLeft = useCountdown(job.expiresAt);
  const expiredFired = useRef(false);

  useEffect(() => {
    if (secondsLeft === 0 && !expiredFired.current) {
      expiredFired.current = true;
      onExpired();
    }
  }, [secondsLeft, onExpired]);

  const assetsByType = job.assets.reduce(
    (acc, asset) => {
      if (!acc[asset.type]) acc[asset.type] = [];
      acc[asset.type].push(asset);
      return acc;
    },
    {} as Record<AssetType, Asset[]>
  );

  const successRate =
    job.totalAssets > 0
      ? Math.round((job.successfulAssets / job.totalAssets) * 100)
      : 0;

  const timerColor =
    secondsLeft === null
      ? "text-muted-foreground"
      : secondsLeft <= 60
      ? "text-destructive"
      : secondsLeft <= 120
      ? "text-yellow-500"
      : "text-muted-foreground";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Scrape Complete
              </CardTitle>
              <p className="text-sm text-muted-foreground font-mono">
                {job.url}
              </p>
              {secondsLeft !== null && secondsLeft > 0 && (
                <p className={`text-xs flex items-center gap-1 ${timerColor}`} data-testid="text-expiry-countdown">
                  <Clock className="h-3 w-3" />
                  Files expire in {formatCountdown(secondsLeft)} — download before they're gone
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={onNewScrape}
                className="gap-2"
                data-testid="button-new-scrape"
              >
                <RefreshCw className="h-4 w-4" />
                New Scrape
              </Button>
              <div className="flex flex-col items-end gap-1">
                <Button
                  onClick={onDownload}
                  disabled={isDownloading || successAssets.length === 0}
                  className="gap-2"
                  data-testid="button-download"
                >
                  {isDownloading ? (
                    <Download className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {isDownloading ? "Preparing..." : "Download ZIP"}
                </Button>
                {!isDownloading && successAssets.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    first free · 1 credit $1.99 · packs from $1.30/credit · $5.99/mo unlimited
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Assets"
              value={job.totalAssets}
              icon={File}
              color="text-muted-foreground"
            />
            <StatCard
              label="Successful"
              value={job.successfulAssets}
              icon={CheckCircle2}
              color="text-green-500"
            />
            <StatCard
              label="Failed"
              value={job.failedAssets}
              icon={XCircle}
              color="text-destructive"
            />
            <StatCard
              label="Success Rate"
              value={`${successRate}%`}
              icon={AlertTriangle}
              color={successRate >= 80 ? "text-green-500" : "text-yellow-500"}
            />
          </div>

          <Tabs defaultValue="by-type" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="by-type" data-testid="tab-by-type">By Type</TabsTrigger>
              <TabsTrigger value="failed" data-testid="tab-failed">
                Failed ({failedAssets.length})
              </TabsTrigger>
              <TabsTrigger value="skipped" data-testid="tab-skipped">
                Skipped ({skippedAssets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="by-type" className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(assetTypeLabels) as AssetType[]).map((type) => {
                  const assets = assetsByType[type] || [];
                  const success = assets.filter(
                    (a) => a.status === "success"
                  ).length;
                  const Icon = assetTypeIcons[type];

                  return (
                    <div
                      key={type}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
                      data-testid={`stat-${type}`}
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {assetTypeLabels[type]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {success} / {assets.length} downloaded
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="failed" className="mt-4">
              <AssetList
                assets={failedAssets}
                emptyMessage="No failed downloads!"
                emptyIcon={CheckCircle2}
                showError
              />
            </TabsContent>

            <TabsContent value="skipped" className="mt-4">
              <AssetList
                assets={skippedAssets}
                emptyMessage="No skipped assets"
                emptyIcon={SkipForward}
                showError
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: typeof File;
  color: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-muted/50 border">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold" data-testid={`text-stat-${label.toLowerCase().replace(" ", "-")}`}>
        {value}
      </p>
    </div>
  );
}

function AssetList({
  assets,
  emptyMessage,
  emptyIcon: EmptyIcon,
  showError,
}: {
  assets: Asset[];
  emptyMessage: string;
  emptyIcon: typeof File;
  showError?: boolean;
}) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <EmptyIcon className="h-8 w-8 mb-2" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-64 rounded-md border bg-muted/30">
      <div className="p-3 space-y-1">
        {assets.map((asset) => {
          const TypeIcon = assetTypeIcons[asset.type];

          return (
            <div
              key={asset.id}
              className="flex items-start gap-2 py-2 px-2 rounded text-sm hover:bg-muted/50 transition-colors"
              data-testid={`failed-asset-${asset.id}`}
            >
              <TypeIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs truncate text-foreground/80">
                    {asset.originalUrl}
                  </span>
                  <a
                    href={asset.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {showError && asset.error && (
                  <p className="text-xs text-destructive mt-1">{asset.error}</p>
                )}
              </div>
              <Badge variant="outline" className="flex-shrink-0 text-xs">
                {asset.type}
              </Badge>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
