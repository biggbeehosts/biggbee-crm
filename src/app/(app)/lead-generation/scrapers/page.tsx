import { getScraperAgents } from "@/lib/data/scraper-registry-store";
import { getScrapingJobs } from "@/lib/data/scraping-jobs-store";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getEnabledOptions } from "@/lib/data/options-store";
import { PageHeader } from "@/components/layout/page-header";
import { ScraperAgentCard, type ScraperAgentStats } from "@/components/scrapers/scraper-agent-card";
import { AgentForm } from "@/components/scrapers/agent-form";

export default async function ScraperAgentsPage() {
  const [agents, jobs, campaigns] = await Promise.all([getScraperAgents(), getScrapingJobs(), getCampaigns()]);
  const countries = getEnabledOptions("countries");

  const statsByAgent = new Map<string, ScraperAgentStats>();
  for (const agent of agents) {
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
      <PageHeader
        title="Scraper Agents"
        subtitle="Run existing scrapers through campaign-aware forms — new agents can be added here without a new page."
        actions={<AgentForm />}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <ScraperAgentCard
            key={agent.id}
            agent={agent}
            stats={statsByAgent.get(agent.id) ?? { lastRun: null, totalLeadsScraped: 0, totalRuns: 0, successfulRuns: 0 }}
            campaigns={campaigns}
            countries={countries}
          />
        ))}
      </div>
    </div>
  );
}
