import type { WorkflowIntegration, WorkflowCardModel } from "@/types";
import { getN8nApiKey, isActionConfigured, type N8nActionKey } from "./config";
import type { WorkflowExecutionStats } from "./admin-client";

const EMPTY_STATS: WorkflowExecutionStats = { executionCount: 0, averageRuntimeSeconds: null, lastExecutionAt: null };

const ENV_VAR_TO_ACTION: Record<string, N8nActionKey> = {
  N8N_WEBHOOK_RUN_CAMPAIGN: "runCampaign",
  N8N_WEBHOOK_REFRESH_KB: "refreshKb",
  N8N_WEBHOOK_STATUS: "status",
};

/** Real n8n state for the Workflow Status card, from the same getWorkflowById() call
 *  workflows/page.tsx already makes for every card's "Last deployment" field -- no second n8n
 *  request. `active`/`lookupError` are null when the admin API isn't configured at all. */
export interface StatusWorkflowHealth {
  adminApiConfigured: boolean;
  active: boolean | null;
  lookupError: string | null;
}

export function integrationToCardModel(
  integration: WorkflowIntegration,
  linkedCampaignCount: number,
  stats: WorkflowExecutionStats = EMPTY_STATS,
  n8nUpdatedAt: string | null = null,
  statusHealth?: StatusWorkflowHealth
): WorkflowCardModel {
  const issues: string[] = [];
  if (!integration.n8nWorkflowId.trim()) issues.push("No n8n workflow ID set.");

  let resolvedActive = integration.active;

  if (integration.purpose === "Status") {
    // Workflow Status doesn't execute anything of its own -- it reports the real state of the
    // shared outreach workflow via the n8n Admin API (workflow existence + active flag +
    // reachability), so it never needs its own dedicated N8N_WEBHOOK_STATUS webhook. This branch
    // replaces the generic webhook-env-var check below for this one purpose only; every other
    // card (Outreach, Knowledge Base) keeps requiring its real webhook exactly as before.
    if (integration.n8nWorkflowId.trim() && statusHealth) {
      if (!statusHealth.adminApiConfigured) {
        issues.push("n8n Admin API is not configured (N8N_ADMIN_API_KEY / N8N_BASE_URL).");
      } else if (statusHealth.lookupError) {
        issues.push(statusHealth.lookupError);
      } else if (statusHealth.active !== null) {
        // Found and reachable -- config is healthy regardless of active/inactive; that's an
        // operational state shown via the existing Active/Inactive badge, not a config problem.
        resolvedActive = statusHealth.active;
      }
    }
  } else {
    const actionKey = ENV_VAR_TO_ACTION[integration.webhookPath];
    if (integration.webhookPath && actionKey && !isActionConfigured(actionKey)) {
      issues.push(`${integration.webhookPath} is not set.`);
    }
    if (!integration.webhookPath && integration.purpose !== "Reply Processing") {
      issues.push("No webhook configured for this integration.");
    }
  }
  if (!getN8nApiKey() && integration.authRef === "N8N_API_KEY") issues.push("N8N_API_KEY is not set.");

  return {
    kind: "integration",
    id: integration.id,
    displayName: integration.displayName,
    purpose: integration.purpose,
    active: resolvedActive,
    n8nWorkflowId: integration.n8nWorkflowId,
    workflowName: integration.workflowName,
    webhookPath: integration.webhookPath || "(no dedicated webhook)",
    authRef: integration.authRef,
    connectionStatus: integration.connectionStatus,
    lastVerifiedAt: integration.lastVerifiedAt,
    lastSuccessfulExecution: integration.lastSuccessfulExecution,
    lastFailedExecution: integration.lastFailedExecution,
    lastErrorSummary: integration.lastErrorSummary,
    currentVersionHash: integration.currentVersionHash,
    executionCount: stats.executionCount,
    averageRuntimeSeconds: stats.averageRuntimeSeconds,
    n8nUpdatedAt,
    expectedInputSchema: integration.expectedInputSchema,
    expectedOutputSchema: integration.expectedOutputSchema,
    linkedLabel: linkedCampaignCount > 0 ? `${linkedCampaignCount} campaign${linkedCampaignCount === 1 ? "" : "s"} run` : "No runs logged yet",
    configHealthy: issues.length === 0,
    configIssues: issues,
    versionHistory: integration.versionHistory.map((v) => ({
      n8nWorkflowId: v.n8nWorkflowId,
      label: `${v.note} (workflow ${v.n8nWorkflowId})`,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
    })),
  };
}

/** Stable, predictable card order for the Workflow Control page. */
export function combineCardModels(integrationCards: WorkflowCardModel[]): WorkflowCardModel[] {
  const purposeOrder: WorkflowCardModel["purpose"][] = ["Outreach", "Status", "Knowledge Base", "Reply Processing"];
  return [...integrationCards].sort((a, b) => purposeOrder.indexOf(a.purpose) - purposeOrder.indexOf(b.purpose));
}
