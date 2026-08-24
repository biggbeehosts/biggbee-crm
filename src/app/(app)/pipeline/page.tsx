export const dynamic = "force-dynamic";

import { Columns3 } from "lucide-react";
import { getLeads } from "@/lib/data/repository";
import { isUsingMockData } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { Badge } from "@/components/ui/badge";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function PipelinePage() {
  const { workspaceId } = await pageWorkspaceContext();
  const [leads, campaigns] = await Promise.all([getLeads(workspaceId), getCampaigns(workspaceId)]);
  const mock = isUsingMockData();

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Drag a card between stages to update its status"
        actions={mock ? <Badge variant="accent">Mock data mode — drag updates are session-only</Badge> : undefined}
        icon={Columns3}
        tone="purple"
      />
      <KanbanBoard leads={leads} campaigns={campaigns} />
    </div>
  );
}
