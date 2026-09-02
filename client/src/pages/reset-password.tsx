import { useState } from "react";
import { useLocation, Link } from "wouter";
import { LockKeyhole, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WsLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import { refreshAuth } from "@/hooks/use-auth";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") || "";

  useSeo({
    title: "Reset Password | Website Sucker",
    description: "Choose a new password for your Website Sucker account.",
    canonicalPath: "/reset-password",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please re-enter the same password in both fields.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      refreshAuth();
      if (data.user) {
        toast({ title: "Password updated", description: "You're signed in with your new password." });
        navigate("/");
      } else {
        toast({ title: "Password updated", description: "Please sign in with your new password." });
        navigate("/auth");
      }
    } catch (err) {
      toast({
        title: "Couldn't reset password",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Invalid reset link</CardTitle>
            <CardDescription>
              This link is missing its reset token.{" "}
              <Link href="/forgot-password" className="underline underline-offset-2">Request a new one</Link>.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="card-reset-password">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <WsLogo markClassName="h-7 w-auto" />
          </div>
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 mb-2 mx-auto">
            <LockKeyhole className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>Enter a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Repeat your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                data-testid="input-confirm-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset-password">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set New Password
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            <Link href="/auth" className="underline underline-offset-2 hover:text-foreground">Back to sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
