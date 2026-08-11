import { Bot, Sparkles } from "lucide-react";
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
 * Shared registry/list/form content for an Automation Hub agent category (Stage 6, Part 1/2/9),
 * parametrized by `category` rather than hardcoded per page. Currently only Lead Sources renders
 * this; the dedicated "AI Agent" category page was removed as redundant, but the category value
 * itself and this component's filtering stay intact -- adding a new Lead Source agent never needs
 * a new page, it's the same AgentForm, same card, same list.
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
    const currentJob = agentJobs.find((j) => j.status === "Running" || j.status === "Queued") ?? null;
    statsByAgent.set(agent.id, {
      lastRun: agentJobs[0]?.startedAt ?? null,
      totalLeadsScraped: agentJobs.reduce((sum, j) => sum + j.importedCount, 0),
      totalRuns: finished.length,
      successfulRuns: successful.length,
      totalScraped: agentJobs.reduce((sum, j) => sum + j.scrapedCount, 0),
      totalValid: agentJobs.reduce((sum, j) => sum + j.validCount, 0),
      totalDuplicates: agentJobs.reduce((sum, j) => sum + j.duplicateCount, 0),
      currentJobCampaignName: currentJob?.campaignName ?? null,
      currentJobStatus: currentJob?.status ?? null,
      lastCampaignName: agentJobs[0]?.campaignName ?? null,
    });
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<AgentForm defaultCategory={category} />}
        icon={category === "Lead Source" ? Bot : Sparkles}
        tone={category === "Lead Source" ? "info" : "purple"}
      />
      {filtered.length === 0 ? (
        <EmptyState icon={Bot} title={`No ${title.toLowerCase()} registered yet`} description={emptyDescription} action={<AgentForm defaultCategory={category} />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <ScraperAgentCard
              key={agent.id}
              agent={agent}
              stats={
                statsByAgent.get(agent.id) ?? {
                  lastRun: null,
                  totalLeadsScraped: 0,
                  totalRuns: 0,
                  successfulRuns: 0,
                  totalScraped: 0,
                  totalValid: 0,
                  totalDuplicates: 0,
                  currentJobCampaignName: null,
                  currentJobStatus: null,
                  lastCampaignName: null,
                }
              }
              campaigns={campaigns}
              countries={countries}
            />
          ))}
        </div>
      )}
    </div>
  );
}
