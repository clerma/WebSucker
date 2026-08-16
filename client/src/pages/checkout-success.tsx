import { useState, useEffect } from "react";
import { CheckCircle2, Download, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";

export default function CheckoutSuccess() {
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [isDownloading, setIsDownloading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isSubscription, setIsSubscription] = useState(false);
  const [isPlan, setIsPlan] = useState(false);
  const [creditsAdded, setCreditsAdded] = useState(0);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const { toast } = useToast();

  useSeo({
    title: "Download Your Website Backup | Website Sucker",
    description:
      "Your payment is confirmed. Download your complete offline website backup.",
    noIndex: true,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    const jid = params.get("job_id");
    const plan = params.get("plan") === "1";
    setSessionId(sid);
    setJobId(jid);
    setIsPlan(plan);

    if (sid && plan) {
      verifyPlan(sid);
    } else if (sid) {
      verifyPayment(sid);
    } else {
      setStatus("failed");
    }
  }, []);

  const verifyPlan = async (sid: string) => {
    try {
      const response = await fetch(`/api/stripe/verify-plan?session_id=${sid}`, { credentials: "include" });
      const data = await response.json();
      if (data.paid) {
        setStatus("success");
        setIsSubscription(data.type === "subscription");
        setCreditsAdded(data.creditsAdded || 0);
        if (typeof data.credits === "number") setCreditBalance(data.credits);
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  };

  const verifyPayment = async (sid: string) => {
    try {
      const response = await fetch(`/api/stripe/verify-payment?session_id=${sid}`);
      const data = await response.json();

      if (data.paid) {
        setStatus("success");
        setJobId(data.jobId || jobId);
        setIsSubscription(data.isSubscription || false);
        if (data.customerId) {
          setCustomerId(data.customerId);
          localStorage.setItem("websitesucker_customer_id", data.customerId);
        }
        if (data.isSubscription) {
          localStorage.setItem("websitesucker_is_subscriber", "true");
        }
      } else {
        setStatus("failed");
      }
    } catch (error) {
      setStatus("failed");
    }
  };

  // Kick off a free re-scrape of a paid job whose files were lost to a server
  // restart. On success, hand the new job to the home page's progress view.
  const tryRecover = async (jid: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/scrape/${jid}/recover`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.job?.id) return false;
      localStorage.setItem(
        "websitesucker_active_job",
        JSON.stringify({ jobId: data.job.id })
      );
      toast({
        title: "Rebuilding your backup",
        description:
          "Your files expired after a server restart, so we're re-creating your backup for free. Hang tight…",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
      return true;
    } catch {
      return false;
    }
  };

  const handleDownload = async () => {
    if (!jobId) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/scrape/${jobId}/download`, { credentials: "include" });
      if (!response.ok) {
        // The server may have restarted since payment — the job and its ZIP
        // are gone but the payment record survives. Offer a free re-scrape.
        if (response.status === 404) {
          const recovered = await tryRecover(jobId);
          if (recovered) return;
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "website-backup.zip";
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
        description: err instanceof Error ? err.message : "Could not download the backup.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="checkout-success-card">
        <CardHeader className="text-center">
          {status === "verifying" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <CardTitle>Verifying Payment...</CardTitle>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-green-600 dark:text-green-400">
                Payment Successful!
              </CardTitle>
            </>
          )}
          {status === "failed" && (
            <>
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <CardTitle className="text-destructive">Payment Verification Failed</CardTitle>
            </>
          )}
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "verifying" && (
            <p className="text-muted-foreground">
              Please wait while we confirm your payment...
            </p>
          )}

          {status === "success" && isPlan && (
            <>
              <p className="text-muted-foreground" data-testid="text-plan-success">
                {isSubscription
                  ? "Your subscription is active — unlimited scrapes and downloads."
                  : creditsAdded > 0
                  ? `${creditsAdded} credit${creditsAdded === 1 ? "" : "s"} added to your account.${creditBalance !== null ? ` You now have ${creditBalance} credit${creditBalance === 1 ? "" : "s"}.` : ""}`
                  : "Your purchase has been applied to your account."}
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={() => (window.location.href = "/")}
                data-testid="button-start-scraping"
              >
                Start Scraping
              </Button>
            </>
          )}

          {status === "success" && !isPlan && (
            <>
              <p className="text-muted-foreground">
                {isSubscription
                  ? "Your subscription is active. You can download unlimited backups."
                  : "Your payment has been confirmed. Click below to download your backup."}
              </p>
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleDownload}
                disabled={isDownloading}
                data-testid="button-download-after-payment"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isDownloading ? "Preparing..." : "Download ZIP"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (window.location.href = "/")}
                data-testid="button-back-home"
              >
                Back to Home
              </Button>
            </>
          )}

          {status === "failed" && (
            <>
              <p className="text-muted-foreground">
                We could not verify your payment. Please try again or contact support.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (window.location.href = "/")}
                data-testid="button-back-home-failed"
              >
                Back to Home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
