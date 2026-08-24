import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getErrors, getLeadMemory, getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getEvents } from "@/lib/data/analytics-events-store";
import { getLeadTaxonomyOptions } from "@/lib/data/options-store";
import { LeadDetailView } from "@/components/lead-detail/lead-detail-view";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function LeadDetailPage({ params }: { params: Promise<{ email: string }> }) {
  const { email } = await params;
  const decodedEmail = decodeURIComponent(email).toLowerCase();

  const { workspaceId } = await pageWorkspaceContext();
  const [leads, memory, errors, campaigns] = await Promise.all([
    getLeads(workspaceId),
    getLeadMemory(workspaceId),
    getErrors(workspaceId),
    getCampaigns(workspaceId),
  ]);
  const taxonomyOptions = getLeadTaxonomyOptions();
  const lead = leads.find((l) => l.email.toLowerCase() === decodedEmail);

  if (!lead) notFound();

  const leadMemory = memory.find((m) => m.email.toLowerCase() === decodedEmail);
  const leadErrors = errors.filter((e) => (e.leadEmail || "").toLowerCase() === decodedEmail);
  // All-time, single-lead lookup -- bounded to this one lead's activity, not a dashboard-scale
  // query, so the wide default range is safe here (Part J: full activity timeline per lead).
  const leadEvents = await getEvents({ leadId: decodedEmail, from: "2020-01-01T00:00:00.000Z", includeTest: true });

  return (
    <div>
      <Link href="/leads" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Leads
      </Link>
      <LeadDetailView lead={lead} memory={leadMemory} errors={leadErrors} campaigns={campaigns} events={leadEvents} taxonomyOptions={taxonomyOptions} />
    </div>
  );
}
