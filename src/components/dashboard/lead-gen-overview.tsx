import Link from "next/link";
import { UserSearch, ListChecks, CheckCircle2, Bot } from "lucide-react";
import type { ScraperAgent, ScrapingJob } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { formatNumber } from "@/lib/utils/format";

interface Tile {
  label: string;
  value: number;
  icon: typeof UserSearch;
}

/** Compact lead-generation summary reusing the same scraper-registry/scraping-jobs data the
 *  Automation Hub and Lead Generation pages already fetch -- no new data source. */
export function LeadGenOverview({ agents, jobs }: { agents: ScraperAgent[]; jobs: ScrapingJob[] }) {
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
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Bot} tone="accent" size="sm" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Lead Generation</p>
              <p className="text-xs text-text-tertiary">
                {activeSources.length}/{leadSources.length} scrapers active
              </p>
            </div>
          </div>
          <Link href="/lead-generation/scraping-jobs" className="text-xs font-medium text-accent hover:underline">
            View jobs
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-border-subtle bg-panel p-3">
              <t.icon className="h-3.5 w-3.5 text-text-tertiary" />
              <p className="mt-1.5 text-lg font-semibold tracking-tight text-text-primary">{formatNumber(t.value)}</p>
              <p className="text-[11px] text-text-tertiary">{t.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
