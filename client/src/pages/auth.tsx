import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Globe, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import { refreshAuth } from "@/hooks/use-auth";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
        throw new Error(data.message || "Something went wrong");
      }
      refreshAuth();
      toast({
        title: mode === "register" ? "Welcome!" : "Welcome back!",
        description:
          mode === "register"
            ? "Your account is ready — your first scrape is free to preview."
            : "You're signed in.",
      });
      navigate("/");
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="card-auth">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-2 mx-auto">
            <Globe className="h-6 w-6 text-primary" />
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

          <p className="text-sm text-muted-foreground text-center mt-4">
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
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
