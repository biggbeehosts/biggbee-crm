export const dynamic = "force-dynamic";

import { getConnectionStatus, getKnowledgeBase } from "@/lib/data/repository";
import { validateEnvironment } from "@/lib/config/env-validation";
import { getConfiguredActionsAction } from "@/lib/n8n/actions";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const [status, env, knowledgeBase, configuredActions] = await Promise.all([
    getConnectionStatus(),
    Promise.resolve(validateEnvironment()),
    getKnowledgeBase(),
    getConfiguredActionsAction(),
  ]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Connection, configuration and theme — nothing else to configure here" />
      <SettingsView status={status} env={env} knowledgeBase={knowledgeBase} refreshKbConfigured={configuredActions.refreshKb} />
    </div>
  );
}
