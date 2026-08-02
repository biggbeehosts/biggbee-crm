import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getErrors, getLeadMemory, getLeads } from "@/lib/data/repository";
import { LeadDetailView } from "@/components/lead-detail/lead-detail-view";

export default async function LeadDetailPage({ params }: { params: Promise<{ email: string }> }) {
  const { email } = await params;
  const decodedEmail = decodeURIComponent(email).toLowerCase();

  const [leads, memory, errors] = await Promise.all([getLeads(), getLeadMemory(), getErrors()]);
  const lead = leads.find((l) => l.email.toLowerCase() === decodedEmail);

  if (!lead) notFound();

  const leadMemory = memory.find((m) => m.email.toLowerCase() === decodedEmail);
  const leadErrors = errors.filter((e) => (e.leadEmail || "").toLowerCase() === decodedEmail);

  return (
    <div>
      <Link href="/leads" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Leads
      </Link>
      <LeadDetailView lead={lead} memory={leadMemory} errors={leadErrors} />
    </div>
  );
}
