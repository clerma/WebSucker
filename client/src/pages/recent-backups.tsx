import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Archive, ChevronRight, Clock, Loader2, Mail, MailCheck, MailWarning } from "lucide-react";
import type { CompletionEmailStatus, RecentBackup } from "@shared/schema";
import { formatBackupCountdown } from "@shared/backup-lifecycle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";

const emailState: Record<CompletionEmailStatus, {
  label: string;
  icon: typeof Mail;
  className: string;
}> = {
  sent: { label: "Email sent", icon: MailCheck, className: "text-emerald-700 border-emerald-200 bg-emerald-50" },
  pending: { label: "Email pending", icon: Mail, className: "text-amber-700 border-amber-200 bg-amber-50" },
  failed: { label: "Email failed", icon: MailWarning, className: "text-destructive border-destructive/20 bg-destructive/5" },
};

export default function RecentBackupsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [backups, setBackups] = useState<RecentBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useSeo({
    title: "Recent Backups | Website Sucker",
    description: "Open your completed Website Sucker backups while they are still available.",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent("/backups")}`, { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/scrape/recent", { credentials: "include" });
        const payload = await response.json().catch(() => null);
        if (response.status === 401) {
          navigate(`/auth?returnTo=${encodeURIComponent("/backups")}`, { replace: true });
          return;
        }
        if (!response.ok) {
          throw new Error(payload?.message || "We couldn't load your recent backups.");
        }
        if (!cancelled) setBackups(payload.backups ?? []);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Couldn't load recent backups",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
          });
          setBackups([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, navigate, toast, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const availableBackups = useMemo(
    () => backups.filter((backup) => new Date(backup.expiresAt).getTime() > now),
    [backups, now],
  );

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading recent backups" />
      </div>
    );
  }

  return (
    <main className="min-h-screen px-4 py-20">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recent backups</h1>
          <p className="mt-2 text-muted-foreground">
            Completed backups stay available for eight hours.
          </p>
        </div>

        {availableBackups.length === 0 ? (
          <Card className="text-center">
            <CardHeader className="items-center">
              <Archive className="h-9 w-9 text-muted-foreground" />
              <CardTitle>No recent backups</CardTitle>
              <CardDescription>
                Your completed, unexpired backups will appear here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/")}>Start a new scrape</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {availableBackups.map((backup) => {
              const email = emailState[backup.completionEmailStatus];
              const EmailIcon = email.icon;
              const remainingSeconds = (new Date(backup.expiresAt).getTime() - now) / 1000;
              return (
                <button
                  key={backup.id}
                  type="button"
                  onClick={() => navigate(`/backup/${backup.id}`)}
                  className="w-full text-left"
                  data-testid={`recent-backup-${backup.id}`}
                >
                  <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
                    <CardContent className="flex items-center gap-4 p-5">
                      <Archive className="hidden h-8 w-8 shrink-0 text-primary sm:block" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="truncate font-semibold">{backup.hostname}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <span>
                            Completed {new Date(backup.completedAt).toLocaleString()}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatBackupCountdown(remainingSeconds)} remaining
                          </span>
                          <Badge variant="outline" className={email.className}>
                            <EmailIcon className="mr-1 h-3.5 w-3.5" />
                            {email.label}
                          </Badge>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}