import Link from "next/link";
import { Radar } from "lucide-react";
import type { CountPoint, ScraperAgent, ScrapingJob } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Pure-CSS conic-gradient ring for a single percentage -- no chart library needed for one value.
 *  Real bar/line charts elsewhere on the dashboard still go through Recharts (see palette.ts). */
function Ring({ percent, label, value }: { percent: number; label: string; value: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(var(--accent) ${clamped * 3.6}deg, var(--bg-surface-raised) 0deg)` }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-accent">{clamped}%</div>
      </div>
      <div>
        <p className="text-lg font-bold tracking-tight text-text-primary">{value}</p>
        <p className="text-[11px] text-text-tertiary">{label}</p>
      </div>
    </div>
  );
}

/** Segmented funnel bar -- Scraped -> Valid -> Imported as proportional stacked widths, so the
 *  drop-off between stages is visible at a glance instead of three disconnected numbers. */
function FunnelBar({ scraped, valid, imported }: { scraped: number; valid: number; imported: number }) {
  const max = Math.max(scraped, 1);
  const stages = [
    { label: "Scraped", value: scraped, className: "bg-info" },
    { label: "Valid", value: valid, className: "bg-accent" },
    { label: "Imported", value: imported, className: "bg-success" },
  ];
  return (
    <div className="space-y-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-text-tertiary">{s.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div className={cn("h-full rounded-full transition-all", s.className)} style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-[11px] font-semibold text-text-primary">{formatNumber(s.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** "Scraping & Intelligence" -- reuses the same scraper-registry/scraping-jobs data the
 *  Automation Hub and Lead Generation pages already fetch, plus leadsBySource (already-fetched
 *  leads) for the source breakdown -- no new data source. */
export function LeadGenOverview({
  agents,
  jobs,
  sourceBreakdown,
}: {
  agents: ScraperAgent[];
  jobs: ScrapingJob[];
  sourceBreakdown: CountPoint[];
}) {
  const leadSources = agents.filter((a) => a.category === "Lead Source");
  const activeSources = leadSources.filter((a) => a.status === "Active");
  const activeJobs = jobs.filter((j) => j.status === "Running" || j.status === "Queued");
  const scraped = jobs.reduce((sum, j) => sum + j.scrapedCount, 0);
  const valid = jobs.reduce((sum, j) => sum + j.validCount, 0);
  const imported = jobs.reduce((sum, j) => sum + j.importedCount, 0);
  const validRate = scraped > 0 ? Math.round((valid / scraped) * 100) : 0;

  const googleMaps = jobs.filter((j) => j.scraperId.toLowerCase().includes("google") || j.scraperName.toLowerCase().includes("google")).reduce((s, j) => s + j.importedCount, 0);
  const instagram = jobs.filter((j) => j.scraperId.toLowerCase().includes("instagram") || j.scraperName.toLowerCase().includes("instagram")).reduce((s, j) => s + j.importedCount, 0);

  return (
    <Card level={2} glow={activeJobs.length > 0} className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Radar} tone={activeJobs.length > 0 ? "lime" : "accent"} size="sm" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Scraping &amp; Intelligence Center</p>
              <p className="text-xs text-text-tertiary">
                {activeSources.length}/{leadSources.length} scrapers active
              </p>
            </div>
          </div>
          {activeJobs.length > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {activeJobs.length} running
            </span>
          ) : (
            <Link href="/lead-generation/scraping-jobs" className="text-xs font-medium text-accent hover:underline">
              View jobs
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Ring percent={validRate} value={formatNumber(valid)} label="Valid leads" />
          <FunnelBar scraped={scraped} valid={valid} imported={imported} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-border-subtle pt-3.5">
          <div className="flex items-center gap-2 rounded-lg bg-panel px-2.5 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-info" />
            <span className="text-[11px] text-text-tertiary">Google Maps</span>
            <span className="ml-auto text-xs font-semibold text-text-primary">{formatNumber(googleMaps)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-panel px-2.5 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-category-purple" />
            <span className="text-[11px] text-text-tertiary">Instagram</span>
            <span className="ml-auto text-xs font-semibold text-text-primary">{formatNumber(instagram)}</span>
          </div>
        </div>

        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Leads by source</p>
          {sourceBreakdown.length === 0 ? (
            <EmptyState title="No source data yet" className="py-4" />
          ) : (
            <div style={{ height: 120 }}>
              <CountBarChart data={sourceBreakdown} maxItems={4} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
