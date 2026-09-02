import { useState } from "react";
import { Link } from "wouter";
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WsLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  useSeo({
    title: "Forgot Password | Website Sucker",
    description: "Reset your Website Sucker account password.",
    canonicalPath: "/forgot-password",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      setSent(true);
    } catch (err) {
      toast({
        title: "Couldn't send reset email",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="card-forgot-password">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <WsLogo markClassName="h-7 w-auto" />
          </div>
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 mb-2 mx-auto">
            {sent ? <MailCheck className="h-6 w-6 text-primary" /> : <KeyRound className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle className="text-2xl">{sent ? "Check your email" : "Forgot your password?"}</CardTitle>
          <CardDescription>
            {sent
              ? `If an account exists for ${email}, we've sent a link to reset your password. The link expires in 1 hour.`
              : "Enter your account email and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
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
                  data-testid="input-forgot-email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-send-reset">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Reset Link
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Didn't get it? Check your spam folder, or{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setSent(false)}
                data-testid="button-try-again"
              >
                try again
              </button>
              .
            </p>
          )}
          <p className="text-sm text-muted-foreground text-center mt-4">
            <Link href="/auth" className="underline underline-offset-2 hover:text-foreground" data-testid="link-back-to-signin">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
