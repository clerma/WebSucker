import { useState, useEffect } from "react";
import { CreditCard, Zap, Calendar, Loader2, Package } from "lucide-react";
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
import { refreshAuth } from "@/hooks/use-auth";

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
  /** When set, an access code can be redeemed to unlock this job's download. */
  jobId?: string;
  onAccessGranted?: () => void;
}

export function PricingDialog({ open, onOpenChange, jobId, onAccessGranted }: PricingDialogProps) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [accessCodeError, setAccessCodeError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchPrices();
      setShowAccessCode(false);
      setAccessCode("");
      setAccessCodeError("");
    }
  }, [open]);

  const handleRedeemAccessCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessCodeLoading(true);
    setAccessCodeError("");
    try {
      const res = await fetch("/api/access-code/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode.trim(), ...(jobId ? { jobId } : {}) }),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        if (data.granted === "credit") {
          toast({ title: "Access code accepted", description: "1 credit was added to your account." });
          refreshAuth();
        } else {
          toast({ title: "Access code accepted", description: "Your download is unlocked." });
        }
        onOpenChange(false);
        if (data.granted !== "credit") onAccessGranted?.();
      } else {
        setAccessCodeError(data.message || "Invalid or expired access code");
      }
    } catch {
      setAccessCodeError("Something went wrong. Please try again.");
    } finally {
      setAccessCodeLoading(false);
    }
  };

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
      const response = await fetch("/api/stripe/checkout-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
        credentials: "include",
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

  const creditPacks = prices
    .filter((p) => !p.recurring && p.metadata?.type === "credits")
    .sort((a, b) => (a.unitAmount || 0) - (b.unitAmount || 0));
  const monthlyPrice = prices.find((p) => p.recurring?.interval === "month");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="pricing-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="h-5 w-5" />
            Get More Scrapes
          </DialogTitle>
          <DialogDescription>
            1 credit = 1 complete website scrape and download. Or go unlimited with a subscription.
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
          <div className="grid gap-3 py-2">
            {creditPacks.map((pack) => {
              const credits = parseInt(pack.metadata?.credits || "0", 10);
              const perCredit = credits > 0 ? (pack.unitAmount || 0) / credits / 100 : 0;
              return (
                <div
                  key={pack.id}
                  className="relative rounded-xl border-2 border-border p-4 hover:border-primary/50 transition-colors"
                  data-testid={`pricing-credits-${credits}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {credits >= 10 ? (
                          <Package className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        ) : (
                          <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                        <h3 className="font-semibold">
                          {credits} Credit{credits === 1 ? "" : "s"} — ${((pack.unitAmount || 0) / 100).toFixed(2)}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {credits === 1
                          ? "1 full scrape + download · never expires"
                          : `${credits} full scrapes + downloads · $${perCredit.toFixed(2)} each · never expire`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() => handleCheckout(pack.id)}
                      disabled={checkoutLoading !== null}
                      data-testid={`button-checkout-credits-${credits}`}
                    >
                      {checkoutLoading === pack.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Buy
                    </Button>
                  </div>
                </div>
              );
            })}

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
                      <h3 className="font-semibold">Unlimited Monthly</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Unlimited scrapes and downloads. Cancel anytime.
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
                  Subscribe — ${((monthlyPrice.unitAmount || 0) / 100).toFixed(2)}/mo
                </Button>
              </div>
            )}

            <div className="text-center pt-1">
                {!showAccessCode ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setShowAccessCode(true)}
                    data-testid="button-show-access-code"
                  >
                    Have an access code?
                  </button>
                ) : (
                  <form onSubmit={handleRedeemAccessCode} className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter access code"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        required
                        data-testid="input-access-code"
                      />
                      <Button type="submit" size="sm" className="h-9" disabled={accessCodeLoading} data-testid="button-redeem-access-code">
                        {accessCodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
                      </Button>
                    </div>
                    {accessCodeError && (
                      <p className="text-xs text-destructive" data-testid="text-access-code-error">{accessCodeError}</p>
                    )}
                  </form>
                )}
              </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
