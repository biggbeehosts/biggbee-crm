export const dynamic = "force-dynamic";

import { getKnowledgeBase } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { KnowledgeBaseView } from "@/components/knowledge-base/kb-view";

export default async function KnowledgeBasePage() {
  const kb = await getKnowledgeBase();

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle="The live biggbees.com content the AI uses as its single source of truth"
      />
      <KnowledgeBaseView kb={kb} />
    </div>
  );
}
