export const dynamic = "force-dynamic";

import { Send } from "lucide-react";
import { getErrors, getLeads } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { OutreachSummary } from "@/components/outreach/outreach-summary";
import { OutreachTable } from "@/components/outreach/outreach-table";
import { ValidationFailures } from "@/components/outreach/validation-failures";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function OutreachPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const [leads, errors] = await Promise.all([getLeads(workspaceId), getErrors(workspaceId)]);

  return (
    <div className="space-y-6">
      <PageHeader title="Outreach" subtitle="Outbound email activity across the whole campaign" icon={Send} tone="success" />
      <OutreachSummary leads={leads} errors={errors} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <OutreachTable leads={leads} />
        </div>
        <ValidationFailures errors={errors} />
      </div>
    </div>
  );
}
