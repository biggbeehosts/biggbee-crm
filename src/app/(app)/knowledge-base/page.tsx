export const dynamic = "force-dynamic";

import { getKnowledgeBase } from "@/lib/data/repository";
import { getConfiguredActionsAction } from "@/lib/n8n/actions";
import { PageHeader } from "@/components/layout/page-header";
import { KnowledgeBaseView } from "@/components/knowledge-base/kb-view";

export default async function KnowledgeBasePage() {
  const [kb, configuredActions] = await Promise.all([getKnowledgeBase(), getConfiguredActionsAction()]);

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle="The live biggbees.com content the AI uses as its single source of truth"
      />
      <KnowledgeBaseView kb={kb} refreshKbConfigured={configuredActions.refreshKb} />
    </div>
  );
}
