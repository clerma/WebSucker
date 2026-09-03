import { useState } from "react";
import type { ScrapeJob } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { refreshAuth } from "@/hooks/use-auth";

export function useBackupDownload(job: ScrapeJob | null) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    if (!job) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/scrape/${job.id}/download`, {
        method: "POST",
        credentials: "include",
      });
      const contentType = response.headers.get("content-type") || "";

      if (response.status === 402) {
        toast({
          title: "Download requires a credit",
          description: "Your free scrape lets you preview the results. Buy a credit pack or subscribe to download the ZIP.",
        });
        setShowPricing(true);
        return;
      }
      if (!response.ok) {
        const payload = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : null;
        throw new Error(payload?.message || "Could not download the backup. Please try again.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      let hostname = "website";
      try {
        hostname = new URL(job.url).hostname;
      } catch {
        // The server validated this URL when the job was created.
      }
      anchor.href = url;
      anchor.download = `website-sucker-${hostname}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);

      toast({
        title: "Download started",
        description: "Your website backup is downloading. You can download it again until it expires.",
      });
      refreshAuth();
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the backup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    handleDownload,
    isDownloading,
    showPricing,
    setShowPricing,
  };
}