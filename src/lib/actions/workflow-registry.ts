"use server";

import { revalidatePath } from "next/cache";
import type { WorkflowIntegration, ContractValidationReport, PaginatedExecutions } from "@/types";
import {
  getWorkflowIntegration,
  recordIntegrationVerification,
  replaceIntegrationAssignment,
  rollbackIntegrationAssignment,
  updateWorkflowIntegration,
} from "@/lib/data/workflow-registry-store";
import {
  isAdminApiConfigured,
  getWorkflowById,
  activateWorkflowById,
  deactivateWorkflowById,
  listExecutionsForWorkflow,
  createWorkflow,
  exportWorkflowJson,
  readableAdminError,
} from "@/lib/n8n/admin-client";
import { backupWorkflow, readBackupRedacted } from "@/lib/n8n/backups";
import { validateOutreachContract } from "@/lib/n8n/contract-validation";
import { compareWorkflows, validateWorkflowStructure, scanForInlinedSecrets, redactWorkflowJson, type WorkflowCompareResult } from "@/lib/n8n/workflow-diff";
import { isAllowedN8nHost, isAdvancedUpdatesEnabled } from "@/lib/n8n/config";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";

export interface ActionResult {
  success: boolean;
  message: string;
}

export type RegistryKind = "integration";

function revalidateWorkflowControl() {
  revalidatePath("/system/workflow-control");
  revalidatePath("/automation-hub/workflows");
  revalidatePath("/automation-hub");
}

async function getEntry(id: string): Promise<WorkflowIntegration | undefined> {
  return getWorkflowIntegration(id);
}

/** Part J.7: "invalid workflow assignment cannot be enabled." "unconfigured" means brand new or
 *  just reassigned and never validated; "error" means the last validation/verification failed --
 *  both block enabling. "unknown" (legacy pre-Change-4 records already running in production) and
 *  "connected" (validated) are allowed, so this never regresses an already-working integration. */
function assertEnableAllowed(entry: { connectionStatus: string; n8nWorkflowId: string }) {
  if (!entry.n8nWorkflowId.trim()) {
    throw new Error("Cannot enable: no n8n workflow ID is assigned.");
  }
  if (entry.connectionStatus === "error") {
    throw new Error("Cannot enable: the last validation failed. Fix the issue and re-validate first.");
  }
  if (entry.connectionStatus === "unconfigured") {
    throw new Error("Cannot enable: this assignment has not been validated yet. Run Validate Contract first.");
  }
}

// ── Test Connection / Refresh Metadata (Part B) ─────────────────────────────────────────────

async function verifyConnection(id: string): Promise<{ status: "connected" | "error"; versionHash: string | null; error?: string }> {
  const entry = await getEntry(id);
  if (!entry) return { status: "error", versionHash: null, error: "Not found." };
  if (!entry.n8nWorkflowId.trim()) return { status: "error", versionHash: null, error: "No n8n workflow ID assigned." };
  if (!isAdminApiConfigured()) return { status: "error", versionHash: null, error: "N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured." };
  try {
    const meta = await getWorkflowById(entry.n8nWorkflowId, { bypassCache: true });
    return { status: "connected", versionHash: meta.versionHash };
  } catch (err) {
    return { status: "error", versionHash: null, error: readableAdminError(err) };
  }
}

export async function testConnectionAction(kind: RegistryKind, id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const result = await verifyConnection(id);
  await recordIntegrationVerification(id, { connectionStatus: result.status, currentVersionHash: result.versionHash, error: result.error });
  await logAudit({ actor, action: "workflow_registry.test_connection", target: id, success: result.status === "connected", details: { kind, error: result.error } });
  revalidateWorkflowControl();
  return result.status === "connected" ? { success: true, message: "Connection verified." } : { success: false, message: result.error ?? "Connection failed." };
}

export async function refreshMetadataAction(kind: RegistryKind, id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const result = await verifyConnection(id);
  await recordIntegrationVerification(id, { connectionStatus: result.status, currentVersionHash: result.versionHash, error: result.error });
  await logAudit({ actor, action: "workflow_registry.refresh_metadata", target: id, success: result.status === "connected", details: { kind } });
  revalidateWorkflowControl();
  return result.status === "connected" ? { success: true, message: "Metadata refreshed." } : { success: false, message: result.error ?? "Refresh failed." };
}

// ── Activate / Deactivate (POST .../activate and .../deactivate) ────────────────────────────

export async function activateWorkflowAction(kind: RegistryKind, id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const entry = await getEntry(id);
  if (!entry) return { success: false, message: "Not found." };
  try {
    assertEnableAllowed(entry);
    if (!isAdminApiConfigured()) throw new Error("N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured.");
    await activateWorkflowById(entry.n8nWorkflowId);
    await updateWorkflowIntegration(id, { active: true });
    await logAudit({ actor, action: "workflow_registry.activate", target: id, success: true, details: { kind, workflowId: entry.n8nWorkflowId } });
    revalidateWorkflowControl();
    return { success: true, message: "Workflow activated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activate failed.";
    await logAudit({ actor, action: "workflow_registry.activate", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

export async function deactivateWorkflowAction(kind: RegistryKind, id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const entry = await getEntry(id);
  if (!entry) return { success: false, message: "Not found." };
  try {
    if (!isAdminApiConfigured()) throw new Error("N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured.");
    await deactivateWorkflowById(entry.n8nWorkflowId);
    await updateWorkflowIntegration(id, { active: false });
    await logAudit({ actor, action: "workflow_registry.deactivate", target: id, success: true, details: { kind, workflowId: entry.n8nWorkflowId } });
    revalidateWorkflowControl();
    return { success: true, message: "Workflow deactivated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deactivate failed.";
    await logAudit({ actor, action: "workflow_registry.deactivate", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

// ── Executions (Part G/I -- paginated, sanitized) ───────────────────────────────────────────

export async function listExecutionsAction(kind: RegistryKind, id: string, cursor: string | null = null, limit = 20): Promise<PaginatedExecutions> {
  const entry = await getEntry(id);
  if (!entry) return { items: [], nextCursor: null, configured: false, error: "Not found." };
  if (!entry.n8nWorkflowId.trim()) return { items: [], nextCursor: null, configured: false };
  if (!isAdminApiConfigured()) return { items: [], nextCursor: null, configured: false };
  try {
    const { data, nextCursor } = await listExecutionsForWorkflow({ workflowId: entry.n8nWorkflowId, limit, cursor });
    return {
      configured: true,
      nextCursor,
      items: data.map((e) => ({
        id: String(e.id),
        workflowId: entry.n8nWorkflowId,
        workflowName: entry.workflowName,
        status: e.status === "success" || e.status === "error" || e.status === "running" || e.status === "waiting" ? e.status : e.stoppedAt ? "unknown" : "running",
        mode: e.mode,
        startedAt: e.startedAt ?? null,
        finishedAt: e.stoppedAt ?? null,
        durationMs: e.startedAt && e.stoppedAt ? new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime() : null,
      })),
    };
  } catch (err) {
    return { items: [], nextCursor: null, configured: true, error: readableAdminError(err) };
  }
}

// ── Contract validation ──────────────────────────────────────────────────────────────────────

export async function validateContractAction(kind: RegistryKind, id: string): Promise<ContractValidationReport | null> {
  const actor = await requireAdmin();
  const entry = await getEntry(id);
  if (!entry) return null;
  const report = await validateOutreachContract(entry);
  const status = report.overallPass ? "connected" : "error";
  const failSummary = report.checks.filter((c) => c.status === "fail").map((c) => c.label).join("; ");
  await recordIntegrationVerification(id, { connectionStatus: status, error: failSummary || undefined });
  await logAudit({ actor, action: "workflow_registry.validate_contract", target: id, success: report.overallPass, details: { kind, checks: report.checks } });
  revalidateWorkflowControl();
  return report;
}

// ── Replace assignment (Part C) ──────────────────────────────────────────────────────────────

export interface ReplaceAssignmentInput {
  n8nWorkflowId: string;
  webhookPathOrEnvVar: string;
  useEnvVar: boolean;
  workflowName?: string;
  note?: string;
}

/** Only ever moves the CRM's own pointer -- never calls the n8n API against the previous
 *  assignment, so the old workflow is neither edited nor deleted (Part C). Forces
 *  connectionStatus back to "unconfigured" so the new assignment cannot be enabled until it
 *  passes Validate Contract (Part C: "enable only after validation passes"). */
export async function replaceAssignmentAction(kind: RegistryKind, id: string, input: ReplaceAssignmentInput): Promise<ActionResult> {
  const actor = await requireAdmin();
  const raw = input.webhookPathOrEnvVar.trim();
  if (!input.useEnvVar && /^https?:\/\//i.test(raw) && !isAllowedN8nHost(raw)) {
    return { success: false, message: "Webhook URL must be on the same host as N8N_BASE_URL, or entered as a bare path." };
  }
  if (!input.n8nWorkflowId.trim()) {
    return { success: false, message: "n8n workflow ID is required." };
  }

  try {
    await replaceIntegrationAssignment(
      id,
      { n8nWorkflowId: input.n8nWorkflowId.trim(), workflowName: input.workflowName || raw, webhookPath: raw },
      actor,
      input.note || "Replaced via Workflow Control"
    );
    await updateWorkflowIntegration(id, { active: false });
    await logAudit({ actor, action: "workflow_registry.replace_assignment", target: id, success: true, details: { kind, n8nWorkflowId: input.n8nWorkflowId } });
    revalidateWorkflowControl();
    return { success: true, message: "Assignment replaced. The previous workflow was left untouched. Run Validate Contract before enabling." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to replace assignment.";
    await logAudit({ actor, action: "workflow_registry.replace_assignment", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

export async function rollbackAssignmentAction(kind: RegistryKind, id: string, versionIndex: number): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    await rollbackIntegrationAssignment(id, versionIndex, actor);
    await logAudit({ actor, action: "workflow_registry.rollback", target: id, success: true, details: { kind, versionIndex } });
    revalidateWorkflowControl();
    return { success: true, message: "Rolled back to the selected version. Run Validate Contract before enabling." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rollback failed.";
    await logAudit({ actor, action: "workflow_registry.rollback", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

// ── Backups (Part F/J.1) ────────────────────────────────────────────────────────────────────

export interface BackupActionResult extends ActionResult {
  fileName?: string;
}

export async function downloadBackupAction(kind: RegistryKind, id: string): Promise<BackupActionResult> {
  const actor = await requireAdmin();
  const entry = await getEntry(id);
  if (!entry) return { success: false, message: "Not found." };
  if (!entry.n8nWorkflowId.trim()) return { success: false, message: "No n8n workflow ID assigned." };
  if (!isAdminApiConfigured()) return { success: false, message: "N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured." };
  try {
    const backup = await backupWorkflow(entry.n8nWorkflowId);
    await logAudit({ actor, action: "workflow_registry.backup", target: id, success: true, details: { kind, fileName: backup.fileName } });
    return { success: true, message: `Backup saved: ${backup.fileName}`, fileName: backup.fileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed.";
    await logAudit({ actor, action: "workflow_registry.backup", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

export async function getBackupContentAction(fileName: string) {
  await requireAdmin();
  return readBackupRedacted(fileName);
}

// ── Advanced: import / compare / deploy / rollback (Part F) ────────────────────────────────
// Disabled unless ADVANCED_WORKFLOW_UPDATES_ENABLED=true -- Part F: "disabled by default."
// isAdvancedUpdatesEnabled lives in lib/n8n/config.ts (a "use server" actions file may only
// export async functions -- see combineCardModels below for the same reason it moved out too).

export interface AdvancedPreviewResult {
  structureValid: boolean;
  structureErrors: string[];
  secretFindings: { nodeName: string; parameterKey: string }[];
  diff: WorkflowCompareResult | null;
  currentRedacted: unknown;
  proposedRedacted: unknown;
  error?: string;
}

/** Read-only: fetches the current workflow, validates+scans the proposed JSON, and returns a
 *  redacted side-by-side diff. Never writes anything, never calls n8n's write endpoints. */
export async function advancedPreviewAction(kind: RegistryKind, id: string, proposedJsonText: string): Promise<AdvancedPreviewResult> {
  await requireAdmin();
  if (!isAdvancedUpdatesEnabled()) {
    return { structureValid: false, structureErrors: ["Advanced Workflow Update is disabled. Set ADVANCED_WORKFLOW_UPDATES_ENABLED=true to enable it."], secretFindings: [], diff: null, currentRedacted: null, proposedRedacted: null };
  }
  let proposed: unknown;
  try {
    proposed = JSON.parse(proposedJsonText);
  } catch {
    return { structureValid: false, structureErrors: ["Uploaded text is not valid JSON."], secretFindings: [], diff: null, currentRedacted: null, proposedRedacted: null };
  }
  const structure = validateWorkflowStructure(proposed);
  const secretFindings = structure.valid ? scanForInlinedSecrets(proposed as { nodes?: unknown[] }) : [];

  const entry = await getEntry(id);
  if (!entry || !entry.n8nWorkflowId.trim()) {
    return { structureValid: structure.valid, structureErrors: structure.errors, secretFindings, diff: null, currentRedacted: null, proposedRedacted: structure.valid ? redactWorkflowJson(proposed as never) : null };
  }
  if (!isAdminApiConfigured()) {
    return { structureValid: structure.valid, structureErrors: structure.errors, secretFindings, diff: null, currentRedacted: null, proposedRedacted: null, error: "N8N_ADMIN_API_KEY is not configured -- cannot fetch the current workflow to diff against." };
  }
  try {
    const current = await exportWorkflowJson(entry.n8nWorkflowId);
    const diff = structure.valid ? compareWorkflows(current, proposed as { name?: string; nodes?: unknown[] }) : null;
    return {
      structureValid: structure.valid,
      structureErrors: structure.errors,
      secretFindings,
      diff,
      currentRedacted: redactWorkflowJson(current),
      proposedRedacted: structure.valid ? redactWorkflowJson(proposed as never) : null,
    };
  } catch (err) {
    return { structureValid: structure.valid, structureErrors: structure.errors, secretFindings, diff: null, currentRedacted: null, proposedRedacted: null, error: readableAdminError(err) };
  }
}

export interface AdvancedDeployResult extends ActionResult {
  newWorkflowId?: string;
  backupFileName?: string;
}

/**
 * Part F's full sequence: re-validate, require typed confirmation, back up the current workflow,
 * create a brand-new workflow (never overwrite in place), then move the registry pointer to it.
 * The previous workflow is left exactly as it was -- inactive-or-active, untouched, undeleted.
 */
export async function advancedDeployAction(
  kind: RegistryKind,
  id: string,
  proposedJsonText: string,
  confirmWorkflowName: string
): Promise<AdvancedDeployResult> {
  const actor = await requireAdmin();
  if (!isAdvancedUpdatesEnabled()) return { success: false, message: "Advanced Workflow Update is disabled." };

  const entry = await getEntry(id);
  if (!entry) return { success: false, message: "Not found." };
  const currentWorkflowName = entry.workflowName;
  if (confirmWorkflowName.trim() !== currentWorkflowName.trim()) {
    return { success: false, message: "Typed workflow name does not match -- deploy cancelled." };
  }

  let proposed: { name: string; nodes: unknown[]; connections: unknown; settings?: unknown };
  try {
    proposed = JSON.parse(proposedJsonText);
  } catch {
    return { success: false, message: "Uploaded text is not valid JSON." };
  }
  const structure = validateWorkflowStructure(proposed);
  if (!structure.valid) return { success: false, message: `Invalid workflow JSON: ${structure.errors.join("; ")}` };
  const secretFindings = scanForInlinedSecrets(proposed);
  if (secretFindings.length > 0) {
    return { success: false, message: `Refusing to deploy: possible inlined secret in ${secretFindings.map((f) => `${f.nodeName}.${f.parameterKey}`).join(", ")}. Use a credential reference instead.` };
  }

  if (!isAdminApiConfigured()) return { success: false, message: "N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured." };

  let backupFileName: string | undefined;
  try {
    if (entry.n8nWorkflowId.trim()) {
      const backup = await backupWorkflow(entry.n8nWorkflowId);
      backupFileName = backup.fileName;
    }
    const created = await createWorkflow({ name: proposed.name, nodes: proposed.nodes, connections: proposed.connections, settings: proposed.settings });

    await replaceIntegrationAssignment(id, { n8nWorkflowId: created.id, workflowName: created.name, webhookPath: entry.webhookPath }, actor, `Deployed new version "${created.name}" via Advanced Workflow Update`);
    await updateWorkflowIntegration(id, { active: false });

    await logAudit({ actor, action: "workflow_registry.advanced_deploy", target: id, success: true, details: { kind, newWorkflowId: created.id, backupFileName } });
    revalidateWorkflowControl();
    return { success: true, message: `Deployed as new workflow "${created.name}" (${created.id}). The previous workflow was left untouched. Run Validate Contract, then a one-result dry test, before activating.`, newWorkflowId: created.id, backupFileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deploy failed.";
    await logAudit({ actor, action: "workflow_registry.advanced_deploy", target: id, success: false, details: { kind, error: message, backupFileName } });
    return { success: false, message };
  }
}

// ── Duplicate / real Export download ────────────────────────────────────────────────────────

export interface DuplicateWorkflowResult extends ActionResult {
  newWorkflowId?: string;
  newWorkflowName?: string;
}

/** One-click duplicate: exports the current workflow and creates a brand-new one from it, named
 *  "<name> (copy)". Purely additive in n8n -- unlike Replace Assignment/Advanced Deploy, this
 *  never touches the registry's own pointer, so the duplicate is just a new workflow sitting in
 *  n8n for the admin to inspect or promote manually. Same "create new, never overwrite" rule as
 *  advancedDeployAction, minus the confirm-typed-name gate since nothing here is being replaced. */
export async function duplicateWorkflowAction(kind: RegistryKind, id: string): Promise<DuplicateWorkflowResult> {
  const actor = await requireAdmin();
  const entry = await getEntry(id);
  if (!entry) return { success: false, message: "Not found." };
  if (!entry.n8nWorkflowId.trim()) return { success: false, message: "No n8n workflow ID assigned." };
  if (!isAdminApiConfigured()) return { success: false, message: "N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured." };

  try {
    const current = await exportWorkflowJson(entry.n8nWorkflowId);
    const created = await createWorkflow({ name: `${current.name} (copy)`, nodes: current.nodes, connections: current.connections, settings: (current as { settings?: unknown }).settings });
    await logAudit({ actor, action: "workflow_registry.duplicate", target: id, success: true, details: { kind, sourceWorkflowId: entry.n8nWorkflowId, newWorkflowId: created.id } });
    return { success: true, message: `Duplicated as "${created.name}" (${created.id}). It is not assigned to anything yet -- use Replace Assignment to point this entry at it.`, newWorkflowId: created.id, newWorkflowName: created.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Duplicate failed.";
    await logAudit({ actor, action: "workflow_registry.duplicate", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

export interface ExportDownloadResult extends ActionResult {
  fileName?: string;
  json?: string;
}

/** Real browser-download export, distinct from downloadBackupAction's server-side-only backup
 *  file -- returns the same redacted JSON downloadBackupAction writes to disk, but as text the
 *  client can hand to a download link. Never includes credentials (redactWorkflowJson strips
 *  them, same as the Advanced panel's diff preview). */
export async function exportWorkflowDownloadAction(kind: RegistryKind, id: string): Promise<ExportDownloadResult> {
  const actor = await requireAdmin();
  const entry = await getEntry(id);
  if (!entry) return { success: false, message: "Not found." };
  if (!entry.n8nWorkflowId.trim()) return { success: false, message: "No n8n workflow ID assigned." };
  if (!isAdminApiConfigured()) return { success: false, message: "N8N_ADMIN_API_KEY / N8N_BASE_URL is not configured." };

  try {
    const current = await exportWorkflowJson(entry.n8nWorkflowId);
    const redacted = redactWorkflowJson(current);
    const workflowName = entry.workflowName;
    const fileName = `${workflowName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${entry.n8nWorkflowId}.json`;
    await logAudit({ actor, action: "workflow_registry.export_download", target: id, success: true, details: { kind, fileName } });
    return { success: true, message: `${workflowName} exported.`, fileName, json: JSON.stringify(redacted, null, 2) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";
    await logAudit({ actor, action: "workflow_registry.export_download", target: id, success: false, details: { kind, error: message } });
    return { success: false, message };
  }
}

// combineCardModels lives in lib/n8n/card-adapters.ts and isAdvancedUpdatesEnabled in
// lib/n8n/config.ts -- a "use server" file may only export async functions, and both of these
// are synchronous pure helpers.
