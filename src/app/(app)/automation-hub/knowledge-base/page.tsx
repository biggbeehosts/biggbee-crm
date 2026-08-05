export const dynamic = "force-dynamic";

import { getKnowledgeBase } from "@/lib/data/repository";
import { getConfiguredActionsAction } from "@/lib/n8n/actions";
import { getWebsiteRegistry } from "@/lib/data/website-registry-store";
import { getWebsiteSyncLogAction } from "@/lib/actions/website-registry";
import { PageHeader } from "@/components/layout/page-header";
import { WebsiteRegistryView } from "@/components/knowledge-base/website-registry-view";
import type { KnowledgeBaseRecord } from "@/types";

export default async function KnowledgeBasePage() {
  const [websites, configuredActions, syncLog] = await Promise.all([getWebsiteRegistry(), getConfiguredActionsAction(), getWebsiteSyncLogAction()]);

  const kbEntries = await Promise.all(websites.map(async (w) => [w.id, await getKnowledgeBase(w.cacheKey)] as const));
  const kbByWebsiteId: Record<string, KnowledgeBaseRecord> = Object.fromEntries(kbEntries);

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle="Stage 6, Part 8: one registry entry per website, each synced into its own Knowledge Base cache"
      />
      <WebsiteRegistryView websites={websites} kbByWebsiteId={kbByWebsiteId} syncLog={syncLog} refreshKbConfigured={configuredActions.refreshKb} />
    </div>
  );
}
