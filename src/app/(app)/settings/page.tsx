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
import { listAccountsAction } from "@/lib/actions/workspace";

const N8N_ACTION_ORDER: N8nActionKey[] = ["runCampaign", "pauseCampaign", "resumeCampaign", "refreshKb", "retryFailed", "status"];

export default async function SettingsPage() {
  const ctx = await pageWorkspaceContext();
  const isFullAdmin = ctx.workspaceIds === "all";
  const [status, env, knowledgeBase, configuredActions, currentWorkspace, allWorkspaces, accounts] = await Promise.all([
    getConnectionStatus(),
    Promise.resolve(validateEnvironment()),
    getKnowledgeBase(),
    getConfiguredActionsAction(),
    getWorkspace(ctx.workspaceId),
    isFullAdmin ? getActiveWorkspaces() : Promise.resolve([]),
    isFullAdmin ? listAccountsAction() : Promise.resolve([]),
  ]);

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
        currentWorkspace={currentWorkspace ?? null}
        isFullAdmin={isFullAdmin}
        allWorkspaces={allWorkspaces}
        initialAccounts={accounts}
      />
    </div>
  );
}
