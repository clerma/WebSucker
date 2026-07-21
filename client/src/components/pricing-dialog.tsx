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
}

export function PricingDialog({ open, onOpenChange }: PricingDialogProps) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchPrices();
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
      <DialogContent className="sm:max-w-lg" data-testid="pricing-dialog">
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
          <div className="grid gap-4 py-2">
            {creditPacks.map((pack) => {
              const credits = parseInt(pack.metadata?.credits || "0", 10);
              const perCredit = credits > 0 ? (pack.unitAmount || 0) / credits / 100 : 0;
              return (
                <div
                  key={pack.id}
                  className="relative rounded-xl border-2 border-border p-5 hover:border-primary/50 transition-colors"
                  data-testid={`pricing-credits-${credits}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {credits >= 10 ? (
                          <Package className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Zap className="h-4 w-4 text-amber-500" />
                        )}
                        <h3 className="font-semibold">{credits} Credits</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {credits} full scrapes + downloads · ${perCredit.toFixed(2)} per scrape · never expire
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          ${((pack.unitAmount || 0) / 100).toFixed(2)}
                        </span>
                        <span className="text-muted-foreground text-sm">one-time</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full mt-4"
                    onClick={() => handleCheckout(pack.id)}
                    disabled={checkoutLoading !== null}
                    data-testid={`button-checkout-credits-${credits}`}
                  >
                    {checkoutLoading === pack.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Buy {credits} Credits — ${((pack.unitAmount || 0) / 100).toFixed(2)}
                  </Button>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
