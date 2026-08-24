export const dynamic = "force-dynamic";

import { ShieldAlert } from "lucide-react";
import { getErrors, getLeads } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorsView } from "@/components/errors/errors-view";
import { DEFAULT_WORKSPACE_ID } from "@/types";

export default async function ErrorsPage() {
  const [errors, leads] = await Promise.all([getErrors(DEFAULT_WORKSPACE_ID), getLeads(DEFAULT_WORKSPACE_ID)]);
  // Errors has no Is Test column of its own (n8n-owned, read-only) -- test status is derived by
  // matching leadEmail against known test leads, same rule Analytics/Dashboard use.
  const testLeadEmails = new Set(leads.filter((l) => l.isTest).map((l) => l.email));

  return (
    <div>
      <PageHeader title="Errors" subtitle="Operational log from the n8n workflow's Errors sheet" icon={ShieldAlert} tone="danger" />
      <ErrorsView errors={errors} testLeadEmails={testLeadEmails} />
    </div>
  );
}
