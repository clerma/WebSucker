import { cn } from "@/lib/utils";

/**
 * Marketing "live crawl" panel for the hero — a static, on-brand mock of the
 * real scrape view (ink plate, mono machine output, cyan progress). Purely
 * presentational; the real scrape UI is ProgressDisplay.
 */

const STATS: [string, string][] = [
  ["Pages", "21"],
  ["Images", "685"],
  ["Scripts", "17"],
  ["Fonts", "5"],
];

const BARS = [38, 54, 30, 72, 46, 88, 60, 50, 90, 64, 40, 78, 52, 34, 68, 44];

const GET_LOG = [
  "/fonts/archivo-var.woff2",
  "/work/case-study-01/",
  "/img/gallery/17.jpg",
  "/pricing/",
  "/assets/css/print.css",
  "/img/logo.svg",
];

export function CrawlPanel({ className }: { className?: string }) {
  return (
    <div className={cn("ws-plate relative overflow-hidden border-2 border-ws-graphite", className)}>
      {/* moving scan line sweeping down the panel */}
      <div
        aria-hidden
        className="ws-scan pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-ws-cyan/0 via-ws-cyan/25 to-ws-cyan/0"
      />
      {/* cyan header rule */}
      <div className="h-0.5 w-full bg-ws-cyan" />

      <div className="flex items-center justify-between border-b border-ws-graphite px-4 py-2.5">
        <span className="ws-label text-ws-steel">Crawling</span>
        <span className="font-mono text-xs text-ws-cyan">example.com</span>
      </div>

      <div className="p-4">
        {/* stat boxes */}
        <div className="grid grid-cols-4 divide-x-2 divide-ws-graphite border-2 border-ws-graphite">
          {STATS.map(([label, value]) => (
            <div key={label} className="p-3">
              <div className="ws-label mb-1 text-ws-steel">{label}</div>
              <div className="font-mono text-lg tabular-nums text-ws-paper">{value}</div>
            </div>
          ))}
        </div>

        {/* asset-size histogram */}
        <div className="mt-4 flex h-16 items-end gap-1" aria-hidden>
          {BARS.map((h, i) => (
            <div
              key={i}
              className={cn("ws-bar flex-1", i % 3 === 0 ? "bg-ws-cyan" : "bg-ws-accent")}
              style={{ height: `${h}%`, animationDelay: `${(i % 12) * 0.08}s` }}
            />
          ))}
        </div>

        {/* request log */}
        <div className="mt-4 space-y-1 font-mono text-xs">
          {GET_LOG.map((path, i) => (
            <div
              key={path}
              className={cn(
                "flex gap-2 truncate",
                i === 0 ? "text-ws-mist" : i < 3 ? "text-ws-steel" : "text-ws-graphite"
              )}
            >
              <span className="text-ws-cyan">GET</span>
              <span className="truncate">{path}</span>
            </div>
          ))}
        </div>

        {/* progress */}
        <div className="mt-4 h-1 w-full bg-ws-graphite">
          <div className="h-full bg-ws-cyan" style={{ width: "62%" }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs text-ws-steel">
          <span>28.7 MB</span>
          <span>62%</span>
        </div>
      </div>
    </div>
  );
}
