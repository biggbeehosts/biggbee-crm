import { getLeads } from "@/lib/data/repository";
import { getEnabledOptions } from "@/lib/data/options-store";
import { PageHeader } from "@/components/layout/page-header";
import { LeadsTable } from "@/components/leads/leads-table";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const [{ search }, leads] = await Promise.all([searchParams, getLeads()]);
  const addLeadOptions = {
    countries: getEnabledOptions("countries"),
    industries: getEnabledOptions("industries"),
  };

  return (
    <div>
      <PageHeader title="Leads" subtitle={`${leads.length} leads across all Biggbee outbound campaigns`} />
      <LeadsTable leads={leads} initialSearch={search ?? ""} addLeadOptions={addLeadOptions} />
    </div>
  );
}
