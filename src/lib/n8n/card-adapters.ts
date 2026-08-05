import type { ScraperAgent, WorkflowIntegration, WorkflowCardModel } from "@/types";
import { getN8nApiKey, resolveScraperWebhookUrl, isActionConfigured, type N8nActionKey } from "./config";
import type { WorkflowExecutionStats } from "./admin-client";

const EMPTY_STATS: WorkflowExecutionStats = { executionCount: 0, averageRuntimeSeconds: null, lastExecutionAt: null };

/** Turns a ScraperAgent (the Scraper-purpose side of the registry) into the shared card shape
 *  the Workflow Control page renders every integration through -- see WorkflowCardModel's doc
 *  comment in src/types/workflow-registry.ts. `stats`/`n8nUpdatedAt` are Stage 6, Part 5 additions,
 *  fetched by the page alongside everything else -- optional so existing callers (if any) that
 *  don't have them yet still compile. */
export function scraperToCardModel(agent: ScraperAgent, linkedCampaignCount: number, stats: WorkflowExecutionStats = EMPTY_STATS, n8nUpdatedAt: string | null = null): WorkflowCardModel {
  const issues: string[] = [];
  if (!agent.n8nWorkflowId.trim()) issues.push("No n8n workflow ID set.");
  const webhookUrl = resolveScraperWebhookUrl(agent);
  if (!webhookUrl) issues.push("Start webhook does not resolve to a URL.");
  if (agent.authType === "header-auth" && !getN8nApiKey()) issues.push("N8N_API_KEY is not set.");

  return {
    kind: "scraper",
    id: agent.id,
    displayName: agent.name,
    purpose: "Scraper",
    active: agent.status === "Active",
    n8nWorkflowId: agent.n8nWorkflowId,
    workflowName: agent.name,
    webhookPath: agent.startWebhookEnvVar || agent.startWebhookPath,
    authRef: agent.authType === "header-auth" ? "N8N_API_KEY" : "(none)",
    connectionStatus: agent.connectionStatus,
    lastVerifiedAt: agent.lastVerifiedAt,
    lastSuccessfulExecution: agent.lastSuccessfulExecution,
    lastFailedExecution: agent.lastFailedExecution,
    lastErrorSummary: agent.lastErrorSummary,
    currentVersionHash: agent.currentVersionHash,
    executionCount: stats.executionCount,
    averageRuntimeSeconds: stats.averageRuntimeSeconds,
    n8nUpdatedAt,
    expectedInputSchema: agent.expectedInputSchema,
    expectedOutputSchema: agent.expectedOutputSchema,
    linkedLabel: linkedCampaignCount > 0 ? `${linkedCampaignCount} scraping job${linkedCampaignCount === 1 ? "" : "s"} run` : "No runs yet",
    configHealthy: issues.length === 0,
    configIssues: issues,
    versionHistory: agent.versionHistory.map((v) => ({
      n8nWorkflowId: v.n8nWorkflowId,
      label: `${v.note} (workflow ${v.n8nWorkflowId})`,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
    })),
  };
}

const ENV_VAR_TO_ACTION: Record<string, N8nActionKey> = {
  N8N_WEBHOOK_RUN_CAMPAIGN: "runCampaign",
  N8N_WEBHOOK_REFRESH_KB: "refreshKb",
  N8N_WEBHOOK_STATUS: "status",
};

export function integrationToCardModel(integration: WorkflowIntegration, linkedCampaignCount: number, stats: WorkflowExecutionStats = EMPTY_STATS, n8nUpdatedAt: string | null = null): WorkflowCardModel {
  const issues: string[] = [];
  if (!integration.n8nWorkflowId.trim()) issues.push("No n8n workflow ID set.");
  const actionKey = ENV_VAR_TO_ACTION[integration.webhookPath];
  if (integration.webhookPath && actionKey && !isActionConfigured(actionKey)) {
    issues.push(`${integration.webhookPath} is not set.`);
  }
  if (!integration.webhookPath && integration.purpose !== "Reply Processing") {
    issues.push("No webhook configured for this integration.");
  }
  if (!getN8nApiKey() && integration.authRef === "N8N_API_KEY") issues.push("N8N_API_KEY is not set.");

  return {
    kind: "integration",
    id: integration.id,
    displayName: integration.displayName,
    purpose: integration.purpose,
    active: integration.active,
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

/** Renders non-scraper integrations first (fixed system workflows), then scrapers -- a stable,
 *  predictable card order for the Workflow Control page (Part B/I). */
export function combineCardModels(scraperCards: WorkflowCardModel[], integrationCards: WorkflowCardModel[]): WorkflowCardModel[] {
  const purposeOrder: WorkflowCardModel["purpose"][] = ["Outreach", "Status", "Knowledge Base", "Reply Processing", "Scraper"];
  return [...integrationCards, ...scraperCards].sort((a, b) => purposeOrder.indexOf(a.purpose) - purposeOrder.indexOf(b.purpose));
}
