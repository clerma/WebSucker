import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, FileArchive, Loader2 } from "lucide-react";
import type { ScrapeJob } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingDialog } from "@/components/pricing-dialog";
import { ResultsSummary } from "@/components/results-summary";
import { useAuth } from "@/hooks/use-auth";
import { useBackupDownload } from "@/hooks/use-backup-download";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";

type PageState = "loading" | "ready" | "expired" | "unavailable" | "failed";

export default function SavedBackupPage({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const {
    handleDownload,
    isDownloading,
    showPricing,
    setShowPricing,
  } = useBackupDownload(job);

  useSeo({
    title: "Saved Backup | Website Sucker",
    description: "Open your saved Website Sucker backup result.",
  });

  const loadJob = useCallback(async () => {
    setPageState("loading");
    try {
      const response = await fetch(`/api/scrape/${encodeURIComponent(jobId)}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) {
        navigate(`/auth?returnTo=${encodeURIComponent(`/backup/${jobId}`)}`, { replace: true });
        return;
      }
      if (response.status === 410) {
        setPageState("expired");
        return;
      }
      if (response.status === 404) {
        setPageState("unavailable");
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message || "We couldn't load this saved backup.");
      }

      const loadedJob = payload as ScrapeJob;
      setJob(loadedJob);
      if (loadedJob.status === "completed") {
        setPageState("ready");
      } else if (loadedJob.status === "failed") {
        setPageState("failed");
      } else {
        window.setTimeout(() => void loadJob(), 3000);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't load this saved backup.";
      toast({
        title: "Couldn't load backup",
        description: message,
        variant: "destructive",
      });
      setPageState("unavailable");
    }
  }, [jobId, navigate, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent(`/backup/${jobId}`)}`, { replace: true });
      return;
    }
    void loadJob();
  }, [authLoading, jobId, loadJob, navigate, user]);

  if (authLoading || pageState === "loading") {
    return (
      <SavedBackupState
        icon={<Loader2 className="h-8 w-8 animate-spin text-primary" />}
        title="Loading your saved backup"
        message="Checking the backup and your account access…"
      />
    );
  }

  if (pageState === "ready" && job) {
    return (
      <div className="min-h-screen px-4 py-20">
        <ResultsSummary
          job={job}
          onDownload={handleDownload}
          onNewScrape={() => navigate("/")}
          isDownloading={isDownloading}
          onExpired={() => setPageState("expired")}
        />
        <PricingDialog
          open={showPricing}
          onOpenChange={setShowPricing}
          jobId={job.id}
          onAccessGranted={handleDownload}
        />
      </div>
    );
  }

  if (pageState === "expired") {
    return (
      <SavedBackupState
        icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
        title="This backup has expired"
        message="Saved backups are available for eight hours. Start a new scrape to create a fresh ZIP."
        action={() => navigate("/")}
        actionLabel="Start a new scrape"
      />
    );
  }

  if (pageState === "failed") {
    return (
      <SavedBackupState
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="This backup did not finish"
        message={job?.errorMessage || "The scrape failed before a downloadable ZIP was created."}
        action={() => navigate("/")}
        actionLabel="Try another scrape"
      />
    );
  }

  return (
    <SavedBackupState
      icon={<FileArchive className="h-8 w-8 text-muted-foreground" />}
      title="Backup unavailable"
      message="This result was not found, has expired, or belongs to a different account."
      action={() => navigate("/")}
      actionLabel="Go to Website Sucker"
    />
  );
}

function SavedBackupState({
  icon,
  title,
  message,
  action,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-20">
      <Card className="w-full max-w-lg text-center">
        <CardHeader className="items-center">
          {icon}
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">{message}</p>
          {action && actionLabel && <Button onClick={action}>{actionLabel}</Button>}
        </CardContent>
      </Card>
    </div>
  );
}