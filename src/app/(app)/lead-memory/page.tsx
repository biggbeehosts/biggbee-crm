export const dynamic = "force-dynamic";

import { getLeadMemory } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { MemoryTable } from "@/components/lead-memory/memory-table";

export default async function LeadMemoryPage() {
  const memory = await getLeadMemory();

  return (
    <div>
      <PageHeader title="Lead Memory" subtitle="What the AI remembers about every lead across the conversation" />
      <MemoryTable memory={memory} />
    </div>
  );
}
