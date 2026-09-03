import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WsLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import { refreshAuth } from "@/hooks/use-auth";
import { safeInternalReturnPath } from "@shared/navigation";

export default function AuthPage() {
  const [returnTo] = useState(() => safeInternalReturnPath(
    new URLSearchParams(window.location.search).get("returnTo"),
  ));
  const [mode, setMode] = useState<"login" | "register">(
    returnTo === "/" ? "register" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useSeo({
    title: mode === "register" ? "Create Account — 1 Free Scrape | Website Sucker" : "Sign In | Website Sucker",
    description: "Create a free Website Sucker account and preview your first scrape free.",
    canonicalPath: "/auth",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") setVerificationSent(true);
        throw new Error(data.message || "Something went wrong");
      }
      if (mode === "register" && data.verificationRequired) {
        setVerificationSent(true);
        toast({
          title: "Check your inbox",
          description: data.message || "We sent you an email verification link.",
        });
        return;
      }
      refreshAuth();
      toast({
        title: mode === "register" ? "Welcome!" : "Welcome back!",
        description:
          mode === "register"
            ? "Your account is ready — your first scrape is free to preview."
            : "You're signed in.",
      });
      navigate(returnTo);
    } catch (err) {
      toast({
        title: mode === "register" ? "Couldn't create account" : "Couldn't sign in",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Couldn't resend the verification email.");
      toast({ title: "Verification email sent", description: data.message });
    } catch (error) {
      toast({
        title: "Couldn't send verification email",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="card-auth">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <WsLogo markClassName="h-7 w-auto" />
          </div>
          <CardTitle className="text-2xl">
            {mode === "register" ? "Create your account" : "Sign in"}
          </CardTitle>
          <CardDescription>
            {mode === "register"
              ? "Your first scrape is free to preview — no card required."
              : "Welcome back. Sign in to keep scraping."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verificationSent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
                Verify that address before signing in or starting a scrape.
              </p>
              <Button type="button" className="w-full" onClick={handleResend} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Resend verification email
              </Button>
              <button
                type="button"
                className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setVerificationSent(false);
                  setMode("login");
                }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                data-testid="input-password"
              />
              {mode === "login" && (
                <p className="text-right">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-auth-submit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mode === "register" ? "Create Account — Get 1 Free Scrape" : "Sign In"}
            </Button>
          </form>
          )}

          {!verificationSent && <p className="text-sm text-muted-foreground text-center mt-4">
            {mode === "register" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setMode("login")}
                  data-testid="button-switch-login"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setMode("register")}
                  data-testid="button-switch-register"
                >
                  Create an account — first scrape free
                </button>
              </>
            )}
          </p>}
        </CardContent>
      </Card>
    </div>
  );
}
