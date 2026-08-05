import "server-only";
import { createHash } from "node:crypto";
import type { AutomationStatus, TriggerResult } from "./types";
import { EMPTY_STATUS } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Real n8n workflow control via n8n's own authenticated REST API -- server-side only, the key
 * never reaches the browser. This is a genuinely different credential from N8N_API_KEY (which is
 * per-webhook Header Auth): N8N_ADMIN_API_KEY is created in n8n under Settings -> n8n API.
 *
 * Change 4 generalizes this module from "one hardcoded N8N_WORKFLOW_ID" to a client parametrized
 * by whatever workflowId a registry entry (scraper agent or WorkflowIntegration) points at, so
 * the Workflow Control page can drive Activate/Deactivate/metadata/executions for every
 * registered integration, not just the one the original Dashboard Automation card tracked.
 * The original single-workflow functions (pauseWorkflow/resumeWorkflow/isWorkflowActive/
 * fetchWorkflowStatusFromAdminApi) are kept as thin wrappers over the generic ones so the
 * Dashboard's existing Pause/Resume controls keep working unchanged.
 *
 * Without N8N_ADMIN_API_KEY (+ N8N_BASE_URL), every function here reports "not configured"
 * rather than guessing -- the UI is expected to disable the corresponding control precisely,
 * not show a misleading active one.
 */

function getAdminCreds(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = (process.env.N8N_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.N8N_ADMIN_API_KEY ?? "").trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function getDefaultWorkflowId(): string {
  return (process.env.N8N_WORKFLOW_ID ?? "").trim();
}

export function isAdminApiConfigured(): boolean {
  return getAdminCreds() !== null;
}

/** Whether the single-workflow Dashboard Automation card (pauseWorkflow/resumeWorkflow/status)
 *  has everything it needs. The generic per-registry-entry functions below only need
 *  getAdminCreds() -- they take workflowId as a parameter instead. */
function isDefaultWorkflowConfigured(): boolean {
  return isAdminApiConfigured() && getDefaultWorkflowId() !== "";
}

export interface N8nExecution {
  id: number | string;
  status?: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string | null;
  finished?: boolean;
  workflowId?: string;
}

export interface N8nWorkflowMetadata {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string | null;
  nodeCount: number;
  /** Short content hash of the workflow's nodes+connections -- changes whenever the workflow is
   *  edited in n8n, regardless of who edited it. Used to show "this workflow changed since we
   *  last checked" without storing the full definition. */
  versionHash: string;
}

async function apiGet<T>(path: string): Promise<T> {
  const cfg = getAdminCreds();
  if (!cfg) throw new Error("n8n admin API is not configured.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { "X-N8N-API-KEY": cfg.apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n API returned HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const cfg = getAdminCreds();
  if (!cfg) throw new Error("n8n admin API is not configured.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: { "X-N8N-API-KEY": cfg.apiKey, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { message?: string };
      detail = errBody.message ?? "";
    } catch {
      // best-effort
    }
    throw new Error(detail || `n8n API returned HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function readableAdminError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return `n8n did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`;
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(err.message)) return "Could not reach n8n.";
    return err.message;
  }
  return "Unexpected error contacting n8n.";
}

// ── Brief in-memory metadata cache (Part I) ─────────────────────────────────────────────────
// Keeps one page render from hitting the n8n API once per card for the same workflow -- a 20s
// TTL is long enough to dedupe within a render/refresh cycle but short enough that "Refresh
// Metadata" (which bypasses this cache entirely) always shows the true current state.
const METADATA_CACHE_TTL_MS = 20_000;
const metadataCache = new Map<string, { expiresAt: number; value: unknown }>();

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = metadataCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  metadataCache.set(key, { expiresAt: Date.now() + METADATA_CACHE_TTL_MS, value });
  return value;
}

function invalidateWorkflowCache(workflowId: string) {
  for (const key of metadataCache.keys()) {
    if (key.includes(workflowId)) metadataCache.delete(key);
  }
}

function computeVersionHash(workflow: { nodes?: unknown; connections?: unknown }): string {
  const material = JSON.stringify({ nodes: workflow.nodes ?? [], connections: workflow.connections ?? {} });
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

/** Full workflow definition as n8n stores it -- used for backups/diffing (Part F), never sent to
 *  the browser as-is (callers must redact credentials first, see workflow-diff.ts). */
export interface N8nWorkflowFull {
  id: string;
  name: string;
  active: boolean;
  nodes: Array<{ name: string; type: string; typeVersion?: number; parameters?: Record<string, unknown>; credentials?: Record<string, unknown> }>;
  connections: Record<string, unknown>;
  updatedAt?: string;
  [key: string]: unknown;
}

/** GET /workflows/{id} -- verifies the workflow exists and is accessible, and is the basis for
 *  both the lightweight metadata card (Part B) and the full export used for backups (Part F). */
export async function getWorkflowById(workflowId: string, opts: { bypassCache?: boolean } = {}): Promise<N8nWorkflowMetadata> {
  const fetchFn = async () => {
    const wf = await apiGet<N8nWorkflowFull>(`/api/v1/workflows/${encodeURIComponent(workflowId)}`);
    return {
      id: wf.id,
      name: wf.name,
      active: wf.active,
      updatedAt: wf.updatedAt ?? null,
      nodeCount: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
      versionHash: computeVersionHash(wf),
    };
  };
  if (opts.bypassCache) {
    const value = await fetchFn();
    metadataCache.set(`meta:${workflowId}`, { expiresAt: Date.now() + METADATA_CACHE_TTL_MS, value });
    return value;
  }
  return withCache(`meta:${workflowId}`, fetchFn);
}

/** Full definition for export/backup/diff -- always bypasses the metadata cache since a backup
 *  must reflect the true current state, not a 20s-stale copy. */
export async function exportWorkflowJson(workflowId: string): Promise<N8nWorkflowFull> {
  return apiGet<N8nWorkflowFull>(`/api/v1/workflows/${encodeURIComponent(workflowId)}`);
}

/**
 * Activation/deactivation for this n8n installation (v2.x) are dedicated POST endpoints, not a
 * PATCH { active } on the workflow resource -- PATCH-with-active was silently accepted by older
 * n8n versions but is rejected (or a no-op) on this one, which is the bug Change 4 fixes (the
 * old pauseWorkflow/resumeWorkflow below used exactly that broken PATCH call).
 */
export async function activateWorkflowById(workflowId: string): Promise<void> {
  await apiPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/activate`);
  invalidateWorkflowCache(workflowId);
}

export async function deactivateWorkflowById(workflowId: string): Promise<void> {
  await apiPost(`/api/v1/workflows/${encodeURIComponent(workflowId)}/deactivate`);
  invalidateWorkflowCache(workflowId);
}

export interface ListExecutionsParams {
  workflowId: string;
  limit?: number;
  cursor?: string | null;
}

export interface ListExecutionsResult {
  data: N8nExecution[];
  nextCursor: string | null;
}

/** GET /executions -- paginated via n8n's own cursor (Part I: "Add pagination for executions and
 *  jobs"). Never fetches a single execution's full `data` field (node input/output) here; that
 *  would risk exposing payloads/credentials in the UI (Part G: "Do not display execution data
 *  containing credentials or raw private payloads"). */
export async function listExecutionsForWorkflow({ workflowId, limit = 20, cursor }: ListExecutionsParams): Promise<ListExecutionsResult> {
  const params = new URLSearchParams({ workflowId, limit: String(Math.min(Math.max(limit, 1), 50)) });
  if (cursor) params.set("cursor", cursor);
  const data = await apiGet<{ data: N8nExecution[]; nextCursor?: string | null }>(`/api/v1/executions?${params.toString()}`);
  return { data: data.data ?? [], nextCursor: data.nextCursor ?? null };
}

/** POST /workflows -- creates a brand-new workflow rather than overwriting an existing one, per
 *  Part F's "prefer creating a new workflow version ... over destructive in-place replacement."
 *  Never called on anything but an admin-confirmed Advanced deploy (see lib/actions/workflow-registry.ts). */
export async function createWorkflow(definition: { name: string; nodes: unknown[]; connections: unknown; settings?: unknown }): Promise<{ id: string; name: string }> {
  return apiPost<{ id: string; name: string }>(`/api/v1/workflows`, definition);
}

function readableError(err: unknown): string {
  return readableAdminError(err);
}

/** Shared by fetchWorkflowStatusFromAdminApi (single Dashboard-tracked workflow) and
 *  getWorkflowExecutionStats (Stage 6, Part 5 -- any registry entry's card) so both compute the
 *  same "average of the last 10 successful runs' wall time" number rather than two definitions
 *  drifting apart. */
function computeExecutionStats(executions: N8nExecution[]): { running: N8nExecution | undefined; mostRecent: N8nExecution | undefined; lastSuccess: N8nExecution | undefined; averageRuntimeSeconds: number | null } {
  const running = executions.find((e) => !e.stoppedAt);
  const mostRecent = executions[0];
  const lastSuccess = executions.find((e) => e.status === "success");
  const recentSuccessful = executions.filter((e) => e.status === "success" && e.startedAt && e.stoppedAt).slice(0, 10);
  const averageRuntimeSeconds =
    recentSuccessful.length > 0
      ? recentSuccessful.reduce((sum, e) => sum + (new Date(e.stoppedAt!).getTime() - new Date(e.startedAt!).getTime()), 0) /
        recentSuccessful.length /
        1000
      : null;
  return { running, mostRecent, lastSuccess, averageRuntimeSeconds };
}

/** Real status derived from n8n's own execution history for the single Dashboard-tracked
 *  workflow -- no separate status webhook needed. */
export async function fetchWorkflowStatusFromAdminApi(): Promise<AutomationStatus> {
  if (!isDefaultWorkflowConfigured()) return { ...EMPTY_STATUS };
  const workflowId = getDefaultWorkflowId();

  const { data: executions } = await listExecutionsForWorkflow({ workflowId, limit: 20 });
  if (executions.length === 0) return { ...EMPTY_STATUS };

  const { running, mostRecent, lastSuccess, averageRuntimeSeconds } = computeExecutionStats(executions);

  return {
    state: running ? "running" : mostRecent!.status === "error" ? "failed" : mostRecent!.status === "success" ? "idle" : "unknown",
    lastRun: mostRecent!.startedAt ?? null,
    lastSuccess: lastSuccess?.stoppedAt ?? null,
    currentJob: running ? `Execution #${running.id} (${running.mode ?? "running"})` : null,
    // Not obtainable from the Executions API without inspecting live node output -- honestly
    // left null rather than guessed.
    currentLead: null,
    averageRuntimeSeconds,
    // n8n's public API doesn't expose queue depth outside queue-mode Bull/Redis internals --
    // honestly left null rather than guessed.
    queueSize: null,
  };
}

export interface WorkflowExecutionStats {
  executionCount: number;
  averageRuntimeSeconds: number | null;
  lastExecutionAt: string | null;
}

/** Stage 6, Part 5: generalizes the same execution-history calc to any registry entry's workflow
 *  ID, not just the single N8N_WORKFLOW_ID the Dashboard tracks -- backs the Workflow Manager
 *  card's Execution Count / Avg Runtime fields. executionCount is "in the last 20 executions
 *  fetched," the same page size listExecutionsForWorkflow already uses elsewhere, not a true
 *  lifetime total (n8n's API has no cheap way to get that without paging through everything). */
export async function getWorkflowExecutionStats(workflowId: string): Promise<WorkflowExecutionStats> {
  if (!isAdminApiConfigured() || !workflowId.trim()) return { executionCount: 0, averageRuntimeSeconds: null, lastExecutionAt: null };
  try {
    const { data: executions } = await listExecutionsForWorkflow({ workflowId, limit: 20 });
    const { mostRecent, averageRuntimeSeconds } = computeExecutionStats(executions);
    return { executionCount: executions.length, averageRuntimeSeconds, lastExecutionAt: mostRecent?.startedAt ?? null };
  } catch {
    return { executionCount: 0, averageRuntimeSeconds: null, lastExecutionAt: null };
  }
}

export async function fetchWorkflowStatusSafe(): Promise<{ configured: boolean; status: AutomationStatus | null; error?: string }> {
  if (!isDefaultWorkflowConfigured()) return { configured: false, status: null };
  try {
    return { configured: true, status: await fetchWorkflowStatusFromAdminApi() };
  } catch (err) {
    return { configured: true, status: null, error: readableError(err) };
  }
}

/**
 * Pause = deactivate the workflow (stops both the schedule triggers AND the Run Campaign
 * webhook -- an inactive n8n workflow's webhook 404s). This is a genuine, coarse-grained pause;
 * there is no partial "pause only the webhook" concept in n8n.
 */
export async function pauseWorkflow(): Promise<TriggerResult> {
  if (!isDefaultWorkflowConfigured()) return { success: false, message: "n8n admin API is not configured." };
  try {
    await deactivateWorkflowById(getDefaultWorkflowId());
    return { success: true, message: "Workflow paused — scheduled sends and Run Campaign are both disabled until resumed." };
  } catch (err) {
    return { success: false, message: `Pause failed: ${readableError(err)}` };
  }
}

export async function resumeWorkflow(): Promise<TriggerResult> {
  if (!isDefaultWorkflowConfigured()) return { success: false, message: "n8n admin API is not configured." };
  try {
    await activateWorkflowById(getDefaultWorkflowId());
    return { success: true, message: "Workflow resumed." };
  } catch (err) {
    return { success: false, message: `Resume failed: ${readableError(err)}` };
  }
}

export async function isWorkflowActive(): Promise<boolean | null> {
  if (!isDefaultWorkflowConfigured()) return null;
  try {
    const meta = await getWorkflowById(getDefaultWorkflowId());
    return meta.active;
  } catch {
    return null;
  }
}
