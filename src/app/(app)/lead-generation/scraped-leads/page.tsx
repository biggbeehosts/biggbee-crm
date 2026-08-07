import { UserSearch } from "lucide-react";
import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getScrapingJobs } from "@/lib/data/scraping-jobs-store";
import { isActionConfigured } from "@/lib/n8n/config";
import { PageHeader } from "@/components/layout/page-header";
import { ScrapedLeadsView } from "@/components/scrapers/scraped-leads-view";

export default async function ScrapedLeadsPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const [{ jobId }, allLeads, campaigns, jobs] = await Promise.all([searchParams, getLeads(), getCampaigns(), getScrapingJobs()]);
  const staged = allLeads.filter((l) => l.status === "Staged");
  const runCampaignConfigured = isActionConfigured("runCampaign");

  return (
    <div>
      <PageHeader title="Scraped Leads" subtitle={`${staged.length} lead${staged.length === 1 ? "" : "s"} staged for review`} icon={UserSearch} tone="info" />
      <ScrapedLeadsView
        leads={staged}
        allLeads={allLeads}
        campaigns={campaigns}
        jobs={jobs}
        initialJobId={jobId ?? ""}
        runCampaignConfigured={runCampaignConfigured}
      />
    </div>
  );
}
