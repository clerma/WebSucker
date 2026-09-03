import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WsLogo } from "@/components/logo";
import { refreshAuth } from "@/hooks/use-auth";
import { useSeo } from "@/lib/seo";

type VerificationState = "verifying" | "verified" | "error";

export default function VerifyEmailPage() {
  const [state, setState] = useState<VerificationState>("verifying");
  const [message, setMessage] = useState("");
  const started = useRef(false);
  const [, navigate] = useLocation();

  useSeo({ title: "Verify Email | Website Sucker", noIndex: true });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Email verification failed.");
        refreshAuth();
        setState("verified");
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Email verification failed.");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <WsLogo markClassName="h-7 w-auto" />
          </div>
          <CardTitle>
            {state === "verifying" ? "Verifying your email" : state === "verified" ? "Email verified" : "Verification failed"}
          </CardTitle>
          <CardDescription>
            {state === "verifying"
              ? "Please wait while we activate your account."
              : state === "verified"
                ? "Your account is active and your free scrape is ready."
                : message}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {state === "verifying" && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
          {state === "verified" && (
            <>
              <CheckCircle2 className="mx-auto mb-4 h-8 w-8 text-emerald-500" />
              <Button className="w-full" onClick={() => navigate("/")}>Start scraping</Button>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth">Return to sign in</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}