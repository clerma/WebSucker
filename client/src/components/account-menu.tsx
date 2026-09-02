import { useState } from "react";
import { useLocation } from "wouter";
import { User, Coins, LogOut, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { PricingDialog } from "@/components/pricing-dialog";

export function AccountMenu({ onDark = false }: { onDark?: boolean }) {
  const { user, isLoading, logout, isLoggingOut } = useAuth();
  const [, navigate] = useLocation();
  const [showPricing, setShowPricing] = useState(false);

  // Legible on the always-dark hero regardless of theme.
  const darkTrigger = onDark
    ? "border-ws-graphite bg-transparent text-ws-paper hover:bg-ws-graphite hover:text-ws-paper"
    : "";

  if (isLoading) return null;

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate("/auth")}
        data-testid="button-sign-in"
        className={darkTrigger}
      >
        <User className="h-4 w-4 mr-1.5" />
        Sign In
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-account-menu" className={cn("gap-1.5", darkTrigger)}>
          <Coins className="h-4 w-4 text-amber-500" />
          <span data-testid="text-credit-balance">
            {!user.freeScrapeUsed ? "1 free scrape" : `${user.credits} credit${user.credits === 1 ? "" : "s"}`}
          </span>
          <span className="ml-1 rounded-none bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
            + Add
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs text-muted-foreground">Signed in as</span>
          <span className="block truncate max-w-[200px]" data-testid="text-account-email">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-sm">
          <Coins className="h-4 w-4 mr-2 text-amber-500" />
          {user.credits} credit{user.credits === 1 ? "" : "s"}
          {!user.freeScrapeUsed ? " + 1 free scrape" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowPricing(true)} data-testid="button-buy-credits">
          <CreditCard className="h-4 w-4 mr-2" />
          Buy credits
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()} disabled={isLoggingOut} data-testid="button-sign-out">
          {isLoggingOut ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
      <PricingDialog open={showPricing} onOpenChange={setShowPricing} />
    </DropdownMenu>
  );
}
