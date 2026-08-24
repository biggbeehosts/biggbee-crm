import { UsersRound } from "lucide-react";
import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getLeadTaxonomyOptions } from "@/lib/data/options-store";
import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable } from "@/components/leads/leads-table";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { workspaceId } = await pageWorkspaceContext();
  const [{ search }, leads, campaigns] = await Promise.all([searchParams, getLeads(workspaceId), getCampaigns(workspaceId)]);
  const addLeadOptions = getLeadTaxonomyOptions();

  return (
    <div>
      <PageHeader title="Leads" subtitle={`${leads.length} leads across all Biggbee outbound campaigns`} icon={UsersRound} tone="info" />
      <LeadsTable leads={leads} initialSearch={search ?? ""} addLeadOptions={addLeadOptions} campaigns={campaigns} />
    </div>
  );
}
