import { useState, useEffect } from "react";
import { BarChart3, Users, Globe, Download, TrendingUp, RefreshCw, Lock, LogOut, Clock, CheckCircle2, XCircle, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AnalyticsData {
  totalJobsCreated: number;
  totalAssetsScraped: number;
  totalDownloads: number;
  uniqueUrlsScraped: string[];
  recentJobs: Array<{
    id: string;
    url: string;
    status: string;
    totalAssets: number;
    successfulAssets: number;
    createdAt: string;
    completedAt?: string;
  }>;
}

interface StripeStats {
  activeSubscribers: number;
  monthlyRevenue: number;
  totalRevenue: number;
  recentCharges: Array<{
    id: string;
    amount: number;
    currency: string;
    description: string | null;
    created: number;
    status: string;
    email: string | null;
  }>;
}

interface AdminStats {
  analytics: AnalyticsData;
  stripe: StripeStats;
}

const STORAGE_KEY = "websitesucker_admin_authed";

export default function Admin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(STORAGE_KEY) === "true");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(false);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-secret": password },
      });
      if (res.ok) {
        sessionStorage.setItem(STORAGE_KEY, "true");
        sessionStorage.setItem("websitesucker_admin_secret", password);
        setAuthed(true);
        const data = await res.json();
        setStats(data);
        setLastRefreshed(new Date());
      } else {
        setAuthError(true);
      }
    } catch {
      setAuthError(true);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchStats = async () => {
    const secret = sessionStorage.getItem("websitesucker_admin_secret");
    if (!secret) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-secret": secret },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setLastRefreshed(new Date());
      } else {
        handleLogout();
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("websitesucker_admin_secret");
    setAuthed(false);
    setStats(null);
  };

  useEffect(() => {
    if (authed) fetchStats();
  }, [authed]);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center pb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mx-auto mb-3">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Admin Access</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Website Sucker dashboard</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={authError ? "border-destructive" : ""}
                  data-testid="input-admin-password"
                  autoFocus
                />
                {authError && (
                  <p className="text-xs text-destructive mt-1">Incorrect password. Try again.</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={authLoading || !password} data-testid="button-admin-login">
                {authLoading ? "Checking..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mrr = stats?.stripe.monthlyRevenue ?? 0;
  const totalRev = stats?.stripe.totalRevenue ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="font-semibold text-lg">Website Sucker — Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Usage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Globe}
              label="Total Scrapes"
              value={stats?.analytics.totalJobsCreated ?? 0}
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <StatCard
              icon={TrendingUp}
              label="Assets Scraped"
              value={(stats?.analytics.totalAssetsScraped ?? 0).toLocaleString()}
              color="text-green-500"
              bg="bg-green-500/10"
            />
            <StatCard
              icon={Download}
              label="Downloads"
              value={stats?.analytics.totalDownloads ?? 0}
              color="text-amber-500"
              bg="bg-amber-500/10"
            />
            <StatCard
              icon={Globe}
              label="Unique Sites"
              value={stats?.analytics.uniqueUrlsScraped.length ?? 0}
              color="text-violet-500"
              bg="bg-violet-500/10"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Revenue</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              icon={Users}
              label="Active Subscribers"
              value={stats?.stripe.activeSubscribers ?? 0}
              color="text-primary"
              bg="bg-primary/10"
            />
            <StatCard
              icon={DollarSign}
              label="MRR"
              value={`$${(mrr / 100).toFixed(2)}`}
              color="text-green-500"
              bg="bg-green-500/10"
            />
            <StatCard
              icon={DollarSign}
              label="Total Revenue"
              value={`$${(totalRev / 100).toFixed(2)}`}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Scrapes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-80">
                {!stats?.analytics.recentJobs.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No scrapes yet</p>
                ) : (
                  <div className="divide-y">
                    {stats.analytics.recentJobs.map((job) => (
                      <div key={job.id} className="px-6 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono truncate">{job.url}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {job.successfulAssets}/{job.totalAssets} assets · {new Date(job.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge
                          variant={job.status === "completed" ? "default" : "destructive"}
                          className="text-xs shrink-0"
                        >
                          {job.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Recent Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-80">
                {!stats?.stripe.recentCharges.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No payments yet</p>
                ) : (
                  <div className="divide-y">
                    {stats.stripe.recentCharges.map((charge) => (
                      <div key={charge.id} className="px-6 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{charge.email ?? "Unknown"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(charge.created * 1000).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">${(charge.amount / 100).toFixed(2)}</p>
                          <Badge
                            variant={charge.status === "succeeded" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {charge.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {(stats?.analytics.uniqueUrlsScraped.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Sites Scraped
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats!.analytics.uniqueUrlsScraped.map((url) => (
                  <Badge key={url} variant="secondary" className="font-mono text-xs">
                    {url}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
