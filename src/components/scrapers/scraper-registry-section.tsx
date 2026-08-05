import { Bot } from "lucide-react";
import type { ScraperAgentCategory } from "@/types";
import { getScraperAgents } from "@/lib/data/scraper-registry-store";
import { getScrapingJobs } from "@/lib/data/scraping-jobs-store";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getEnabledOptions } from "@/lib/data/options-store";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ScraperAgentCard, type ScraperAgentStats } from "./scraper-agent-card";
import { AgentForm } from "./agent-form";

/**
 * Shared content for the Automation Hub's Lead Sources and AI Agents sub-pages (Stage 6, Part
 * 1/2/9) -- both are the same registry/list/form, filtered to a different `category`. Adding a
 * new agent in either category never needs a new page: it's the same AgentForm, same card, same
 * list, just filtered differently.
 */
export async function ScraperRegistrySection({
  category,
  title,
  subtitle,
  emptyDescription,
}: {
  category: ScraperAgentCategory;
  title: string;
  subtitle: string;
  emptyDescription: string;
}) {
  const [agents, jobs, campaigns] = await Promise.all([getScraperAgents(), getScrapingJobs(), getCampaigns()]);
  const countries = getEnabledOptions("countries");
  const filtered = agents.filter((a) => a.category === category);

  const statsByAgent = new Map<string, ScraperAgentStats>();
  for (const agent of filtered) {
    const agentJobs = jobs.filter((j) => j.scraperId === agent.id && j.startedAt);
    const finished = agentJobs.filter((j) => j.completedAt);
    const successful = finished.filter((j) => j.status === "Completed" || j.status === "Partially Completed");
    statsByAgent.set(agent.id, {
      lastRun: agentJobs[0]?.startedAt ?? null,
      totalLeadsScraped: agentJobs.reduce((sum, j) => sum + j.importedCount, 0),
      totalRuns: finished.length,
      successfulRuns: successful.length,
    });
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={<AgentForm defaultCategory={category} />} />
      {filtered.length === 0 ? (
        <EmptyState icon={Bot} title={`No ${title.toLowerCase()} registered yet`} description={emptyDescription} action={<AgentForm defaultCategory={category} />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <ScraperAgentCard
              key={agent.id}
              agent={agent}
              stats={statsByAgent.get(agent.id) ?? { lastRun: null, totalLeadsScraped: 0, totalRuns: 0, successfulRuns: 0 }}
              campaigns={campaigns}
              countries={countries}
            />
          ))}
        </div>
      )}
    </div>
  );
}
