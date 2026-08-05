import "server-only";
import type { WorkflowIntegration, WorkflowVersionEntry, WorkflowConnectionStatus } from "@/types";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/**
 * Registry for the non-scraper integrations (Outreach / Status / Knowledge Base / Reply
 * Processing) -- the Scraper-purpose side of the Change 4 registry lives directly on ScraperAgent
 * (see scraper-registry-store.ts) to avoid duplicating that config across two stores.
 *
 * These entries wrap the CRM's existing fixed n8n action webhooks (src/lib/n8n/config.ts) and
 * the single admin-tracked workflow (N8N_WORKFLOW_ID) rather than introducing a second way to
 * configure the same thing -- n8nWorkflowId/webhookPath here are *descriptive* of what's already
 * wired via env vars; changing them here does not change env vars, only which card/label the
 * Workflow Control page shows (Replace Assignment updates both consistently, see
 * lib/actions/workflow-registry.ts).
 */

const COLLECTION = "workflow-integrations";
const now = () => new Date().toISOString();

const SEED_INTEGRATIONS: WorkflowIntegration[] = [
  {
    id: "wf-outreach",
    displayName: "Outbound Cold Email — Run Campaign",
    purpose: "Outreach",
    n8nWorkflowId: process.env.N8N_WORKFLOW_ID?.trim() || "",
    workflowName: "Outbound Cold Email System",
    webhookPath: "N8N_WEBHOOK_RUN_CAMPAIGN",
    authRef: "N8N_API_KEY",
    active: true,
    connectionStatus: "unknown",
    lastVerifiedAt: null,
    lastSuccessfulExecution: null,
    lastFailedExecution: null,
    currentVersionHash: null,
    expectedInputSchema: ["campaignId", "campaignName", "country", "industry", "businessType", "leadGenerationType", "service", "minConfidence", "maxLeadsPerRun", "dailySendLimit"],
    expectedOutputSchema: ["campaignId", "status"],
    versionHistory: [],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "wf-status",
    displayName: "Workflow Status",
    purpose: "Status",
    n8nWorkflowId: process.env.N8N_WORKFLOW_ID?.trim() || "",
    workflowName: "Outbound Cold Email System",
    webhookPath: "N8N_WEBHOOK_STATUS",
    authRef: "N8N_ADMIN_API_KEY",
    active: true,
    connectionStatus: "unknown",
    lastVerifiedAt: null,
    lastSuccessfulExecution: null,
    lastFailedExecution: null,
    currentVersionHash: null,
    expectedInputSchema: [],
    expectedOutputSchema: ["state", "lastRun", "currentJob", "lastSuccess", "averageRuntimeSeconds", "queueSize"],
    versionHistory: [],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "wf-knowledge-base",
    displayName: "Knowledge Base Refresh",
    purpose: "Knowledge Base",
    n8nWorkflowId: process.env.N8N_WORKFLOW_ID?.trim() || "",
    workflowName: "Outbound Cold Email System",
    webhookPath: "N8N_WEBHOOK_REFRESH_KB",
    authRef: "N8N_API_KEY",
    active: true,
    connectionStatus: "unknown",
    lastVerifiedAt: null,
    lastSuccessfulExecution: null,
    lastFailedExecution: null,
    currentVersionHash: null,
    expectedInputSchema: [],
    expectedOutputSchema: [],
    versionHistory: [],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "wf-reply-processing",
    displayName: "Reply Processing",
    purpose: "Reply Processing",
    n8nWorkflowId: process.env.N8N_WORKFLOW_ID?.trim() || "",
    workflowName: "Outbound Cold Email System",
    // Schedule-triggered inside the main workflow today, not a dedicated webhook -- connection
    // status for this card comes from the admin API's execution history alone (see
    // contract-validation.ts), never fabricated as "connected" without a real check.
    webhookPath: "",
    authRef: "N8N_ADMIN_API_KEY",
    active: true,
    connectionStatus: "unknown",
    lastVerifiedAt: null,
    lastSuccessfulExecution: null,
    lastFailedExecution: null,
    currentVersionHash: null,
    expectedInputSchema: [],
    expectedOutputSchema: ["fromEmail", "matchedLeadEmail", "action"],
    versionHistory: [],
    createdAt: now(),
    updatedAt: now(),
  },
];

function backfill(raw: WorkflowIntegration): WorkflowIntegration {
  const entry = raw as Partial<WorkflowIntegration>;
  return { versionHistory: [], expectedInputSchema: [], expectedOutputSchema: [], ...entry } as WorkflowIntegration;
}

async function getAll(): Promise<WorkflowIntegration[]> {
  const raw = readCollection<WorkflowIntegration[]>(COLLECTION, SEED_INTEGRATIONS);
  return raw.map(backfill);
}

async function saveAll(entries: WorkflowIntegration[]): Promise<void> {
  await writeCollection(COLLECTION, entries);
}

export async function getWorkflowIntegrations(): Promise<WorkflowIntegration[]> {
  return getAll();
}

export async function getWorkflowIntegration(id: string): Promise<WorkflowIntegration | undefined> {
  const all = await getAll();
  return all.find((w) => w.id === id);
}

export async function updateWorkflowIntegration(id: string, fields: Partial<Omit<WorkflowIntegration, "id" | "createdAt">>): Promise<WorkflowIntegration> {
  const all = await getAll();
  const existing = all.find((w) => w.id === id);
  if (!existing) throw new Error(`Workflow integration "${id}" was not found.`);
  const updated: WorkflowIntegration = { ...existing, ...fields, updatedAt: now() };
  await saveAll(all.map((w) => (w.id === id ? updated : w)));
  return updated;
}

export async function recordIntegrationVerification(
  id: string,
  result: { connectionStatus: WorkflowConnectionStatus; currentVersionHash?: string | null; error?: string }
): Promise<WorkflowIntegration> {
  return updateWorkflowIntegration(id, {
    connectionStatus: result.connectionStatus,
    lastVerifiedAt: now(),
    currentVersionHash: result.currentVersionHash ?? undefined,
    lastErrorSummary: result.error,
  });
}

export async function recordIntegrationExecutionOutcome(id: string, success: boolean): Promise<void> {
  const existing = await getWorkflowIntegration(id);
  if (!existing) return;
  await updateWorkflowIntegration(id, success ? { lastSuccessfulExecution: now() } : { lastFailedExecution: now() });
}

/** Same non-destructive contract as replaceScraperAssignment: only the CRM's own pointer moves;
 *  the previous n8n workflow this integration pointed at is never edited or deleted. */
export async function replaceIntegrationAssignment(
  id: string,
  next: { n8nWorkflowId: string; workflowName: string; webhookPath: string },
  actor: string,
  note: string
): Promise<WorkflowIntegration> {
  const existing = await getWorkflowIntegration(id);
  if (!existing) throw new Error(`Workflow integration "${id}" was not found.`);
  const previousEntry: WorkflowVersionEntry = {
    n8nWorkflowId: existing.n8nWorkflowId,
    workflowName: existing.workflowName,
    webhookPath: existing.webhookPath,
    versionHash: existing.currentVersionHash,
    note,
    createdAt: now(),
    createdBy: actor,
  };
  return updateWorkflowIntegration(id, {
    n8nWorkflowId: next.n8nWorkflowId,
    workflowName: next.workflowName,
    webhookPath: next.webhookPath,
    connectionStatus: "unknown",
    lastVerifiedAt: null,
    currentVersionHash: null,
    versionHistory: [previousEntry, ...existing.versionHistory],
  });
}

export async function rollbackIntegrationAssignment(id: string, versionIndex: number, actor: string): Promise<WorkflowIntegration> {
  const existing = await getWorkflowIntegration(id);
  if (!existing) throw new Error(`Workflow integration "${id}" was not found.`);
  const target = existing.versionHistory[versionIndex];
  if (!target) throw new Error("That version history entry no longer exists.");
  return replaceIntegrationAssignment(
    id,
    { n8nWorkflowId: target.n8nWorkflowId, workflowName: target.workflowName, webhookPath: target.webhookPath ?? "" },
    actor,
    `Rolled back to version from ${target.createdAt}`
  );
}
