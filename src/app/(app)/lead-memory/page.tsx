export const dynamic = "force-dynamic";

import { Brain } from "lucide-react";
import { getLeadMemory } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { MemoryTable } from "@/components/lead-memory/memory-table";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function LeadMemoryPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const memory = await getLeadMemory(workspaceId);

  return (
    <div>
      <PageHeader title="Lead Memory" subtitle="What the AI remembers about every lead across the conversation" icon={Brain} tone="purple" />
      <MemoryTable memory={memory} />
    </div>
  );
}
