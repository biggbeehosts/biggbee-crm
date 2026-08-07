import Link from "next/link";
import { UserSearch, ListChecks, CheckCircle2, Bot } from "lucide-react";
import type { CountPoint, ScraperAgent, ScrapingJob } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";

interface Tile {
  label: string;
  value: number;
  icon: typeof UserSearch;
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

  const tiles: Tile[] = [
    { label: "Scraped", value: scraped, icon: UserSearch },
    { label: "Valid", value: valid, icon: CheckCircle2 },
    { label: "Imported", value: imported, icon: ListChecks },
    { label: "Running Jobs", value: activeJobs.length, icon: Bot },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Bot} tone="accent" size="sm" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Scraping &amp; Intelligence</p>
              <p className="text-xs text-text-tertiary">
                {activeSources.length}/{leadSources.length} scrapers active
              </p>
            </div>
          </div>
          <Link href="/lead-generation/scraping-jobs" className="text-xs font-medium text-accent hover:underline">
            View jobs
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-border-subtle bg-panel p-3">
              <t.icon className="h-3.5 w-3.5 text-text-tertiary" />
              <p className="mt-1.5 text-lg font-semibold tracking-tight text-text-primary">{formatNumber(t.value)}</p>
              <p className="text-[11px] text-text-tertiary">{t.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Leads by source</p>
          {sourceBreakdown.length === 0 ? (
            <EmptyState title="No source data yet" className="py-4" />
          ) : (
            <div style={{ height: 140 }}>
              <CountBarChart data={sourceBreakdown} maxItems={5} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
