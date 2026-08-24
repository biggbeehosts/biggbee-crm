import { getWorkflowIntegrations } from "@/lib/data/workflow-registry-store";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getLeads } from "@/lib/data/repository";
import { getAuditLog } from "@/lib/audit/log";
import { isAdminApiConfigured, getWorkflowExecutionStats, getWorkflowById, readableAdminError } from "@/lib/n8n/admin-client";
import { getN8nEditorUrl, isAdvancedUpdatesEnabled } from "@/lib/n8n/config";
import { getConfiguredActionsAction } from "@/lib/n8n/actions";
import { integrationToCardModel, combineCardModels } from "@/lib/n8n/card-adapters";
import { PageHeader } from "@/components/layout/page-header";
import { WorkflowIntegrationCard } from "@/components/workflow-control/workflow-integration-card";
import { AlertTriangle, Cable } from "lucide-react";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

export default async function WorkflowManagerPage() {
  // Part I: fetch everything this render needs in parallel -- one page load never makes n8n
  // calls sequentially per card. Card-level actions (Test Connection, Refresh Metadata, ...) are
  // separate on-demand server actions, not part of this initial render.
  const { workspaceId } = await pageWorkspaceContext();
  const [integrations, campaigns, leads, auditLog, configuredActions] = await Promise.all([
    getWorkflowIntegrations(),
    getCampaigns(workspaceId),
    getLeads(workspaceId),
    Promise.resolve(getAuditLog(500)),
    getConfiguredActionsAction(),
  ]);
  const advancedEnabled = isAdvancedUpdatesEnabled();
  const adminApiConfigured = isAdminApiConfigured();

  const runCampaignRuns = auditLog.filter((a) => a.action === "n8n.runCampaign" && a.success).length;

  // Stage 6, Part 5: execution count / avg runtime / last-deployment metadata per card, fetched in
  // the same parallel batch as everything else above -- getWorkflowExecutionStats and
  // getWorkflowById both honestly return "not available" without hitting n8n when the admin API
  // isn't configured or a card has no n8nWorkflowId yet, so this never adds a failing call.
  // `active`/`lookupError` are the same getWorkflowById() response the Workflow Status card needs
  // to report real health (see card-adapters.ts) -- no second n8n call for that, just reading two
  // more fields off this one already-fetched result.
  async function cardMeta(workflowId: string) {
    if (!adminApiConfigured || !workflowId.trim()) {
      return { stats: { executionCount: 0, averageRuntimeSeconds: null, lastExecutionAt: null }, n8nUpdatedAt: null, active: null as boolean | null, lookupError: null as string | null };
    }
    let lookupError: string | null = null;
    const [stats, meta] = await Promise.all([
      getWorkflowExecutionStats(workflowId),
      getWorkflowById(workflowId).catch((err) => {
        lookupError = readableAdminError(err);
        return null;
      }),
    ]);
    return { stats, n8nUpdatedAt: meta?.updatedAt ?? null, active: meta?.active ?? null, lookupError };
  }

  const integrationCards = await Promise.all(
    integrations.map(async (integration) => {
      const runs = integration.purpose === "Outreach" ? runCampaignRuns : 0;
      const { stats, n8nUpdatedAt, active, lookupError } = await cardMeta(integration.n8nWorkflowId);
      return integrationToCardModel(integration, runs, stats, n8nUpdatedAt, { adminApiConfigured, active, lookupError });
    })
  );
  const cards = combineCardModels(integrationCards);

  return (
    <div>
      <PageHeader
        title="Workflow Manager"
        subtitle="Connect outreach workflows to n8n, change assignments safely, and monitor executions -- without editing workflow JSON by hand."
        icon={Cable}
        tone="orange"
      />

      {!adminApiConfigured && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/10 p-3.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            N8N_ADMIN_API_KEY / N8N_BASE_URL are not configured -- Test Connection, Refresh Metadata, Activate/Deactivate, Executions, and Validate
            Contract&apos;s reachability check will report &quot;not configured&quot; until they&apos;re set.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <WorkflowIntegrationCard
            key={`${card.kind}-${card.id}`}
            kind={card.kind}
            card={card}
            n8nEditorUrl={getN8nEditorUrl(card.n8nWorkflowId)}
            advancedEnabled={advancedEnabled}
            outreachExtras={card.purpose === "Outreach" ? { campaigns, leads, runCampaignConfigured: configuredActions.runCampaign } : undefined}
            kbSyncConfigured={card.purpose === "Knowledge Base" ? configuredActions.refreshKb : undefined}
          />
        ))}
      </div>
    </div>
  );
}
