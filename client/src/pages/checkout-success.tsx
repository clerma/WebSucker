import { useState, useEffect } from "react";
import { CheckCircle2, Download, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function CheckoutSuccess() {
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [isDownloading, setIsDownloading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [isSubscription, setIsSubscription] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    const jid = params.get("job_id");
    setSessionId(sid);
    setJobId(jid);

    if (sid) {
      verifyPayment(sid);
    } else {
      setStatus("failed");
    }
  }, []);

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
          localStorage.setItem("websucker_customer_id", data.customerId);
        }
        if (data.isSubscription) {
          localStorage.setItem("websucker_is_subscriber", "true");
        }
      } else {
        setStatus("failed");
      }
    } catch (error) {
      setStatus("failed");
    }
  };

  const handleDownload = async () => {
    if (!jobId) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/scrape/${jobId}/download`);
      if (!response.ok) {
        const error = await response.json();
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

          {status === "success" && (
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
