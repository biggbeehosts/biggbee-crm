export const dynamic = "force-dynamic";

import { SlidersHorizontal } from "lucide-react";
import { getConnectionStatus, getKnowledgeBase } from "@/lib/data/repository";
import { validateEnvironment } from "@/lib/config/env-validation";
import { getConfiguredActionsAction } from "@/lib/n8n/actions";
import { N8N_ACTION_LABELS, type N8nActionKey } from "@/lib/n8n/config";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";
import { getWorkspace, getActiveWorkspaces } from "@/lib/data/workspace-store";
import { getDefaultWebsite } from "@/lib/data/website-registry-store";
import { listAccountsAction } from "@/lib/actions/workspace";
import { toPublicWorkspace } from "@/types";

const N8N_ACTION_ORDER: N8nActionKey[] = ["runCampaign", "pauseCampaign", "resumeCampaign", "refreshKb", "retryFailed", "status"];

export default async function SettingsPage() {
  const ctx = await pageWorkspaceContext();
  const isFullAdmin = ctx.workspaceIds === "all";
  // Phase F: the Knowledge Base card must reflect the ACTIVE workspace's own site, never
  // Biggbee's -- getKnowledgeBase()'s "latest" default is specifically Biggbee's pre-Stage-6 KB
  // (see repository.ts doc comment), so resolve this workspace's own default Website Registry
  // entry first and read its cacheKey instead of relying on that default.
  const [status, env, defaultWebsite, configuredActions, currentWorkspace, allWorkspaces, accounts] = await Promise.all([
    getConnectionStatus(),
    Promise.resolve(validateEnvironment()),
    getDefaultWebsite(ctx.workspaceId),
    getConfiguredActionsAction(),
    getWorkspace(ctx.workspaceId),
    isFullAdmin ? getActiveWorkspaces() : Promise.resolve([]),
    isFullAdmin ? listAccountsAction() : Promise.resolve([]),
  ]);
  const knowledgeBase = defaultWebsite
    ? await getKnowledgeBase(defaultWebsite.cacheKey)
    : { cacheKey: "", knowledgeBaseText: "", updatedAt: null, sourceCount: 0, sections: [] };

  // Booleans only -- never the webhook URLs or the API key.
  const n8nActions = N8N_ACTION_ORDER.map((action) => ({
    action,
    label: N8N_ACTION_LABELS[action],
    configured: configuredActions[action] ?? false,
  }));

  return (
    <div>
      <PageHeader title="Settings" subtitle="Connection, automation, configuration and theme" icon={SlidersHorizontal} tone="lime" />
      <SettingsView
        status={status}
        env={env}
        knowledgeBase={knowledgeBase}
        refreshKbConfigured={configuredActions.refreshKb}
        n8nActions={n8nActions}
        currentWorkspace={currentWorkspace ? toPublicWorkspace(currentWorkspace) : null}
        isFullAdmin={isFullAdmin}
        allWorkspaces={allWorkspaces.map(toPublicWorkspace)}
        initialAccounts={accounts}
      />
    </div>
  );
}
