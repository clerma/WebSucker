import { useState, useEffect } from "react";
import { BarChart3, Users, Globe, Download, TrendingUp, RefreshCw, Lock, LogOut, Clock, DollarSign, KeyRound, Plus, Trash2, Copy, Check, Infinity, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";

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
    failedAssets: number;
    errorMessage?: string;
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
    website: string | null;
  }>;
  failedPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    created: number;
    email: string | null;
    failureCode: string | null;
    failureMessage: string | null;
    outcome: string | null;
  }>;
}

interface AdminStats {
  analytics: AnalyticsData;
  stripe: StripeStats;
}

interface AccessCode {
  code: string;
  note: string;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

const STORAGE_KEY = "websitesucker_admin_authed";

export default function Admin() {
  useSeo({ title: "Admin Dashboard | Website Sucker", noIndex: true });
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(STORAGE_KEY) === "true");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [codeNote, setCodeNote] = useState("");
  const [codeMaxUses, setCodeMaxUses] = useState("");
  const [codeGenerating, setCodeGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { toast } = useToast();

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

  const fetchAccessCodes = async () => {
    const secret = sessionStorage.getItem("websitesucker_admin_secret");
    if (!secret) return;
    const res = await fetch("/api/admin/access-codes", { headers: { "x-admin-secret": secret } });
    if (res.ok) {
      const data = await res.json();
      setAccessCodes(data.codes);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const secret = sessionStorage.getItem("websitesucker_admin_secret");
    if (!secret) return;
    setCodeGenerating(true);
    try {
      const res = await fetch("/api/admin/access-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ note: codeNote, maxUses: codeMaxUses ? parseInt(codeMaxUses) : null }),
      });
      const data = await res.json();
      if (data.code) {
        setAccessCodes((prev) => [data.code, ...prev]);
        setCodeNote("");
        setCodeMaxUses("");
      }
    } finally {
      setCodeGenerating(false);
    }
  };

  const handleDeleteCode = async (code: string) => {
    const secret = sessionStorage.getItem("websitesucker_admin_secret");
    if (!secret) return;
    await fetch(`/api/admin/access-codes/${code}`, { method: "DELETE", headers: { "x-admin-secret": secret } });
    setAccessCodes((prev) => prev.filter((c) => c.code !== code));
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: "Copied!", description: `${code} copied to clipboard.` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  useEffect(() => {
    if (authed) {
      fetchStats();
      fetchAccessCodes();
    }
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <BarChart3 className="h-5 w-5 text-primary shrink-0" />
          <h1 className="font-semibold text-base sm:text-lg truncate">Website Sucker — Admin</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Usage</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            <StatCard
              icon={AlertTriangle}
              label="Failed Scrapes"
              value={stats?.analytics.recentJobs.filter(j => j.status === "failed").length ?? 0}
              color="text-destructive"
              bg="bg-destructive/10"
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
              <div className="h-80 overflow-y-auto overflow-x-hidden">
                {!stats?.analytics.recentJobs.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No scrapes yet</p>
                ) : (
                  <div className="divide-y">
                    {stats.analytics.recentJobs.map((job) => (
                      <div
                        key={job.id}
                        className={`px-4 sm:px-6 py-3 flex items-start justify-between gap-3 ${job.status === "failed" ? "bg-destructive/5" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono break-all">{job.url}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {job.status === "completed"
                              ? `${job.successfulAssets}/${job.totalAssets} assets · `
                              : ""}
                            {new Date(job.createdAt).toLocaleString()}
                          </p>
                          {job.status === "failed" && job.errorMessage && (
                            <p className="text-xs text-destructive mt-1 flex items-start gap-1">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span className="break-words min-w-0">{job.errorMessage}</span>
                            </p>
                          )}
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
              </div>
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
              <div className="h-80 overflow-y-auto overflow-x-hidden">
                {!stats?.stripe.recentCharges.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No payments yet</p>
                ) : (
                  <div className="divide-y">
                    {stats.stripe.recentCharges.map((charge) => (
                      <div key={charge.id} className="px-4 sm:px-6 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{charge.email ?? "Unknown"}</p>
                          {charge.website && (
                            <p className="text-xs text-foreground/80 truncate mt-0.5" title={charge.website}>
                              {charge.website.replace(/^https?:\/\//, "")}
                            </p>
                          )}
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
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Failed Card Attempts
              {(stats?.stripe.failedPayments.length ?? 0) > 0 && (
                <Badge variant="destructive" className="text-xs ml-auto">
                  {stats!.stripe.failedPayments.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-64 overflow-y-auto overflow-x-hidden">
              {!stats?.stripe.failedPayments.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No failed payments</p>
              ) : (
                <div className="divide-y">
                  {stats.stripe.failedPayments.map((f) => (
                    <div key={f.id} className="px-4 sm:px-6 py-3 bg-destructive/5 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.email ?? "Unknown email"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(f.created * 1000).toLocaleString()}
                        </p>
                        {(f.failureMessage || f.outcome) && (
                          <p className="text-xs text-destructive mt-1 flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>{f.failureMessage ?? f.outcome}</span>
                          </p>
                        )}
                        {f.failureCode && (
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            code: {f.failureCode}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">${(f.amount / 100).toFixed(2)}</p>
                        <Badge variant="destructive" className="text-xs">failed</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Access Codes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleGenerateCode} className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
                <Input
                  placeholder="e.g. For John"
                  value={codeNote}
                  onChange={(e) => setCodeNote(e.target.value)}
                  data-testid="input-code-note"
                />
              </div>
              <div className="w-28">
                <label className="text-xs text-muted-foreground mb-1 block">Max uses</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="∞"
                  value={codeMaxUses}
                  onChange={(e) => setCodeMaxUses(e.target.value)}
                  data-testid="input-code-max-uses"
                />
              </div>
              <Button type="submit" disabled={codeGenerating} className="gap-2" data-testid="button-generate-code">
                <Plus className="h-4 w-4" />
                {codeGenerating ? "Generating…" : "Generate Code"}
              </Button>
            </form>

            {accessCodes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No access codes yet. Generate one above.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {accessCodes.map((c) => (
                  <div key={c.code} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold tracking-wider text-sm">{c.code}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCopyCode(c.code)}
                          data-testid={`button-copy-code-${c.code}`}
                        >
                          {copiedCode === c.code ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.note || "No note"} · {c.uses} used
                        {c.maxUses !== null ? ` / ${c.maxUses} max` : " · unlimited"}
                        {" · "}{new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={c.maxUses !== null && c.uses >= c.maxUses ? "destructive" : "secondary"} className="text-xs shrink-0">
                      {c.maxUses === null ? "∞" : `${c.uses}/${c.maxUses}`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDeleteCode(c.code)}
                      data-testid={`button-delete-code-${c.code}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                  <Badge key={url} variant="secondary" className="font-mono text-xs whitespace-normal break-all max-w-full text-left">
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
          <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold leading-tight truncate">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
