import { Inbox } from "lucide-react";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getInboxPlacementTests, getSeedRecipients } from "@/lib/data/deliverability-store";
import { summarizeDeliverability, deliverabilityByProvider } from "@/lib/calculations/deliverability-metrics";
import { PageHeader } from "@/components/layout/page-header";
import { DeliverabilityAdminView } from "@/components/system/deliverability-admin-view";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function DeliverabilityAdminPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const [campaigns, tests, seeds] = await Promise.all([getCampaigns(workspaceId), getInboxPlacementTests(), getSeedRecipients()]);
  const summary = summarizeDeliverability(tests);
  const byProvider = deliverabilityByProvider(tests);

  return (
    <div>
      <PageHeader
        title="Deliverability"
        subtitle="Inbox-placement testing — only ever populated by a real seed-list test or manual entry, never inferred from opens/clicks/replies"
        icon={Inbox}
        tone="warning"
      />
      <DeliverabilityAdminView campaigns={campaigns} tests={tests} seeds={seeds} summary={summary} byProvider={byProvider} />
    </div>
  );
}
