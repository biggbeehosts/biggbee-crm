import { Radar } from "lucide-react";
import { getScrapingJobs } from "@/lib/data/scraping-jobs-store";
import { getScraperAgents } from "@/lib/data/scraper-registry-store";
import { getN8nBaseUrl } from "@/lib/n8n/config";
import { PageHeader } from "@/components/layout/page-header";
import { ScrapingJobsView } from "@/components/scrapers/scraping-jobs-view";

export default async function ScrapingJobsPage() {
  const [jobs, agents] = await Promise.all([getScrapingJobs(), getScraperAgents()]);
  const agentByScraperId = new Map(agents.map((a) => [a.id, a]));
  const baseUrl = getN8nBaseUrl();

  const executionUrls: Record<string, string | null> = {};
  for (const job of jobs) {
    const agent = agentByScraperId.get(job.scraperId);
    executionUrls[job.id] = baseUrl && agent && job.n8nExecutionId ? `${baseUrl}/workflow/${agent.n8nWorkflowId}/executions/${job.n8nExecutionId}` : null;
  }

  return (
    <div>
      <PageHeader title="Scraping Jobs" subtitle={`${jobs.length} scraping run${jobs.length === 1 ? "" : "s"} across all agents`} icon={Radar} tone="info" />
      <ScrapingJobsView jobs={jobs} executionUrls={executionUrls} />
    </div>
  );
}
