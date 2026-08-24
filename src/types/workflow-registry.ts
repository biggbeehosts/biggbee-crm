/**
 * The Workflow Registry is the CRM-owned model behind the Workflow Control page. It never stores
 * n8n credentials or secret values -- only references to env-var *names* (see
 * WorkflowIntegration.authRef) that are resolved server-side.
 *
 * Outreach / Status / Knowledge Base / Reply Processing entries are WorkflowIntegration records
 * below, stored in workflow-registry-store.ts, since they wrap the CRM's existing fixed n8n
 * action webhooks (src/lib/n8n/config.ts). The Workflow Control page renders them through one
 * shared card shape, WorkflowCardModel, produced by adapters -- see src/lib/n8n/card-adapters.ts.
 */

export type WorkflowPurpose = "Outreach" | "Status" | "Knowledge Base" | "Reply Processing";

export const WORKFLOW_PURPOSES: WorkflowPurpose[] = ["Outreach", "Status", "Knowledge Base", "Reply Processing"];

export type WorkflowConnectionStatus = "connected" | "error" | "unknown" | "unconfigured";

/** One historical version of a workflow assignment -- what Replace Assignment and the Advanced
 *  "deploy as new version" action append to, and what Rollback reads from. Never deletes the
 *  n8n workflow it points away from (see Part C/F: "must not edit or delete the old workflow"). */
export interface WorkflowVersionEntry {
  n8nWorkflowId: string;
  workflowName: string;
  webhookPath?: string;
  versionHash: string | null;
  note: string;
  createdAt: string;
  createdBy: string;
}

export interface WorkflowIntegration {
  id: string;
  displayName: string;
  purpose: WorkflowPurpose;
  n8nWorkflowId: string;
  workflowName: string;
  /** Bare path joined onto N8N_BASE_URL, or a full same-host URL. Empty when this integration has
   *  no dedicated webhook (e.g. a schedule-triggered Reply Processing flow inside the main
   *  workflow) -- connection status is then derived from the admin API alone. */
  webhookPath: string;
  /** Reference to an env-var *name* holding the auth secret -- never the value itself. */
  authRef: string;
  active: boolean;
  connectionStatus: WorkflowConnectionStatus;
  lastVerifiedAt: string | null;
  lastSuccessfulExecution: string | null;
  lastFailedExecution: string | null;
  lastErrorSummary?: string;
  currentVersionHash: string | null;
  expectedInputSchema: string[];
  expectedOutputSchema: string[];
  linkedCampaignIds?: string[];
  versionHistory: WorkflowVersionEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Result of one individual Part-E contract check, shown as its own row in the UI -- never
 *  collapsed into a single pass/fail. */
export type ContractCheckStatus = "pass" | "fail" | "warn" | "skipped";

export interface ContractCheckResult {
  id: string;
  label: string;
  status: ContractCheckStatus;
  detail: string;
}

export interface ContractValidationReport {
  integrationId: string;
  ranAt: string;
  checks: ContractCheckResult[];
  /** true only when every non-skipped check passed. */
  overallPass: boolean;
}

/** Sanitized execution row for Part G -- never includes n8n's raw execution `data` (node
 *  input/output), which can carry payloads or, on some nodes, credential-adjacent values. */
export interface ExecutionSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "success" | "error" | "running" | "waiting" | "unknown";
  mode?: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  /** Best-effort match against the CRM's own audit log / scraping-job records by nearest
   *  timestamp -- never authoritative, always labeled as such in the UI. */
  linkedCampaignId?: string;
  linkedJobId?: string;
}

export interface PaginatedExecutions {
  items: ExecutionSummary[];
  nextCursor: string | null;
  configured: boolean;
  error?: string;
}

/** Shape the Workflow Control page renders every card from, built from a WorkflowIntegration
 *  record. */
export interface WorkflowCardModel {
  kind: "integration";
  id: string;
  displayName: string;
  purpose: WorkflowPurpose;
  active: boolean;
  n8nWorkflowId: string;
  workflowName: string;
  webhookPath: string;
  authRef: string;
  connectionStatus: WorkflowConnectionStatus;
  lastVerifiedAt: string | null;
  lastSuccessfulExecution: string | null;
  lastFailedExecution: string | null;
  lastErrorSummary?: string;
  currentVersionHash: string | null;
  /** Stage 6, Part 5 -- fetched alongside the card's other metadata via
   *  getWorkflowExecutionStats/getWorkflowById; null when the admin API isn't configured or the
   *  workflow has no n8nWorkflowId yet, never guessed. */
  executionCount: number | null;
  averageRuntimeSeconds: number | null;
  n8nUpdatedAt: string | null;
  expectedInputSchema: string[];
  expectedOutputSchema: string[];
  linkedLabel: string;
  configHealthy: boolean;
  configIssues: string[];
  /** Flattened for card display -- Rollback (Part H) reassigns to versionHistory[index]. */
  versionHistory: { n8nWorkflowId: string; label: string; createdAt: string; createdBy: string }[];
}
