export const dynamic = "force-dynamic";

import { getLeads } from "@/lib/data/repository";
import { isUsingMockData } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { Badge } from "@/components/ui/badge";

export default async function PipelinePage() {
  const leads = await getLeads();
  const mock = isUsingMockData();

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Drag a card between stages to update its status"
        actions={mock ? <Badge variant="accent">Mock data mode — drag updates are session-only</Badge> : undefined}
      />
      <KanbanBoard leads={leads} />
    </div>
  );
}
