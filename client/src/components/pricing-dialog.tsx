import { useState, useEffect } from "react";
import { CreditCard, Zap, Calendar, Loader2, Mail, CheckCircle2, ChevronDown, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Price {
  id: string;
  unitAmount: number;
  currency: string;
  recurring: { interval: string } | null;
  metadata: Record<string, string>;
}

interface PricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onSubscriptionRestored?: (customerId: string) => void;
  onAccessGranted?: () => void;
}

export function PricingDialog({ open, onOpenChange, jobId, onSubscriptionRestored, onAccessGranted }: PricingDialogProps) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [accessCodeSuccess, setAccessCodeSuccess] = useState(false);
  const [accessCodeError, setAccessCodeError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchPrices();
      setShowRestore(false);
      setRestoreEmail("");
      setRestoreSuccess(false);
      setRestoreError("");
      setShowAccessCode(false);
      setAccessCode("");
      setAccessCodeSuccess(false);
      setAccessCodeError("");
    }
  }, [open]);

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/stripe/prices");
      if (!response.ok) throw new Error("Failed to fetch prices");
      const data = await response.json();
      setPrices(data.prices || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not load pricing. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (priceId: string) => {
    setCheckoutLoading(priceId);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, jobId }),
      });

      if (!response.ok) throw new Error("Failed to create checkout");

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not start checkout. Please try again.",
        variant: "destructive",
      });
      setCheckoutLoading(null);
    }
  };

  const handleRestoreAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestoreLoading(true);
    setRestoreError("");
    try {
      const res = await fetch("/api/stripe/customer-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: restoreEmail }),
      });
      const data = await res.json();
      if (data.found && data.customerId) {
        localStorage.setItem("websitesucker_customer_id", data.customerId);
        localStorage.setItem("websitesucker_is_subscriber", "true");
        setRestoreSuccess(true);
        onSubscriptionRestored?.(data.customerId);
        setTimeout(() => onOpenChange(false), 1500);
      } else {
        setRestoreError(data.message || "No active subscription found for this email.");
      }
    } catch {
      setRestoreError("Could not look up your subscription. Please try again.");
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRedeemAccessCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessCodeLoading(true);
    setAccessCodeError("");
    try {
      const res = await fetch("/api/access-code/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode.trim().toUpperCase(), jobId }),
      });
      const data = await res.json();
      if (data.success) {
        setAccessCodeSuccess(true);
        setTimeout(() => {
          onOpenChange(false);
          onAccessGranted?.();
        }, 1500);
      } else {
        setAccessCodeError(data.message || "Invalid or expired access code.");
      }
    } catch {
      setAccessCodeError("Could not validate the code. Please try again.");
    } finally {
      setAccessCodeLoading(false);
    }
  };

  const oneTimePrice = prices.find((p) => !p.recurring);
  const monthlyPrice = prices.find((p) => p.recurring?.interval === "month");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="pricing-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="h-5 w-5" />
            Unlock Your Download
          </DialogTitle>
          <DialogDescription>
            Analysing is free. Choose a plan to download the complete offline backup.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : prices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Pricing is not available right now. Please try again later.</p>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            {oneTimePrice && (
              <div
                className="relative rounded-xl border-2 border-border p-5 hover:border-primary/50 transition-colors"
                data-testid="pricing-one-time"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-amber-500" />
                      <h3 className="font-semibold">One-Time Download</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Pay once for this download. Perfect for a single backup.
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">
                        ${((oneTimePrice.unitAmount || 0) / 100).toFixed(2)}
                      </span>
                      <span className="text-muted-foreground text-sm">one-time</span>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  onClick={() => handleCheckout(oneTimePrice.id)}
                  disabled={checkoutLoading !== null}
                  data-testid="button-checkout-one-time"
                >
                  {checkoutLoading === oneTimePrice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Pay ${((oneTimePrice.unitAmount || 0) / 100).toFixed(2)}
                </Button>
              </div>
            )}

            {monthlyPrice && (
              <div
                className="relative rounded-xl border-2 border-primary p-5"
                data-testid="pricing-monthly"
              >
                <div className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Best Value
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold">Monthly Subscription</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Unlimited downloads every month. Cancel anytime.
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">
                        ${((monthlyPrice.unitAmount || 0) / 100).toFixed(2)}
                      </span>
                      <span className="text-muted-foreground text-sm">/month</span>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  variant="default"
                  onClick={() => handleCheckout(monthlyPrice.id)}
                  disabled={checkoutLoading !== null}
                  data-testid="button-checkout-monthly"
                >
                  {checkoutLoading === monthlyPrice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Subscribe - ${((monthlyPrice.unitAmount || 0) / 100).toFixed(2)}/mo
                </Button>
              </div>
            )}

            <div className="border-t pt-3 space-y-2">
              <button
                type="button"
                onClick={() => { setShowAccessCode(!showAccessCode); setAccessCodeError(""); setShowRestore(false); }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                data-testid="button-have-access-code"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Have an access code?
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAccessCode ? "rotate-180" : ""}`} />
              </button>

              {showAccessCode && (
                <div className="mt-1">
                  {accessCodeSuccess ? (
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 py-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Access granted! Closing…</span>
                    </div>
                  ) : (
                    <form onSubmit={handleRedeemAccessCode} className="space-y-2">
                      <Input
                        type="text"
                        placeholder="e.g. SUNSET-4821"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                        required
                        className={`font-mono tracking-wider ${accessCodeError ? "border-destructive" : ""}`}
                        data-testid="input-access-code"
                      />
                      {accessCodeError && (
                        <p className="text-xs text-destructive">{accessCodeError}</p>
                      )}
                      <Button
                        type="submit"
                        variant="outline"
                        className="w-full"
                        disabled={accessCodeLoading || !accessCode}
                        data-testid="button-access-code-submit"
                      >
                        {accessCodeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {accessCodeLoading ? "Validating…" : "Apply Code"}
                      </Button>
                    </form>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => { setShowRestore(!showRestore); setRestoreError(""); setShowAccessCode(false); }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                data-testid="button-already-subscribed"
              >
                <Mail className="h-3.5 w-3.5" />
                Already subscribed? Restore access
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRestore ? "rotate-180" : ""}`} />
              </button>

              {showRestore && (
                <div className="mt-1">
                  {restoreSuccess ? (
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 py-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Subscription restored! Closing…</span>
                    </div>
                  ) : (
                    <form onSubmit={handleRestoreAccess} className="space-y-2">
                      <Input
                        type="email"
                        placeholder="Enter your subscription email"
                        value={restoreEmail}
                        onChange={(e) => setRestoreEmail(e.target.value)}
                        required
                        className={restoreError ? "border-destructive" : ""}
                        data-testid="input-restore-email"
                      />
                      {restoreError && (
                        <p className="text-xs text-destructive">{restoreError}</p>
                      )}
                      <Button
                        type="submit"
                        variant="outline"
                        className="w-full"
                        disabled={restoreLoading || !restoreEmail}
                        data-testid="button-restore-submit"
                      >
                        {restoreLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {restoreLoading ? "Looking up…" : "Restore Access"}
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
