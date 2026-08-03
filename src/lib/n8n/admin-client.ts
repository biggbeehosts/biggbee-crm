import "server-only";
import type { AutomationStatus, TriggerResult } from "./types";
import { EMPTY_STATUS } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Real n8n status/pause/resume via n8n's own authenticated REST API -- server-side only, the key
 * never reaches the browser. This is a genuinely different credential from N8N_API_KEY (which is
 * per-webhook Header Auth): N8N_ADMIN_API_KEY is created in n8n under Settings -> n8n API.
 *
 * Without both N8N_ADMIN_API_KEY and N8N_WORKFLOW_ID set, every function here reports
 * "not configured" rather than guessing -- the UI is expected to disable the corresponding
 * control precisely, not show a misleading active one.
 */

function getConfig(): { baseUrl: string; apiKey: string; workflowId: string } | null {
  const baseUrl = (process.env.N8N_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.N8N_ADMIN_API_KEY ?? "").trim();
  const workflowId = (process.env.N8N_WORKFLOW_ID ?? "").trim();
  if (!baseUrl || !apiKey || !workflowId) return null;
  return { baseUrl, apiKey, workflowId };
}

export function isAdminApiConfigured(): boolean {
  return getConfig() !== null;
}

interface N8nExecution {
  id: number | string;
  status?: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string | null;
  finished?: boolean;
}

async function apiGet<T>(path: string): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("n8n admin API is not configured.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { "X-N8N-API-KEY": cfg.apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n API returned HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPatch(path: string, body: unknown): Promise<void> {
  const cfg = getConfig();
  if (!cfg) throw new Error("n8n admin API is not configured.");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "PATCH",
    headers: { "X-N8N-API-KEY": cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n API returned HTTP ${res.status}`);
}

function readableError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "n8n did not respond within 15 seconds.";
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(err.message)) return "Could not reach n8n.";
    return err.message;
  }
  return "Unexpected error contacting n8n.";
}

/** Real status derived from n8n's own execution history -- no separate status webhook needed. */
export async function fetchWorkflowStatusFromAdminApi(): Promise<AutomationStatus> {
  const cfg = getConfig();
  if (!cfg) return { ...EMPTY_STATUS };

  const data = await apiGet<{ data: N8nExecution[] }>(`/api/v1/executions?workflowId=${cfg.workflowId}&limit=20`);
  const executions = data.data ?? [];
  if (executions.length === 0) return { ...EMPTY_STATUS };

  const running = executions.find((e) => !e.stoppedAt);
  const mostRecent = executions[0];
  const lastSuccessExecution = executions.find((e) => e.status === "success");
  const recentSuccessful = executions.filter((e) => e.status === "success" && e.startedAt && e.stoppedAt).slice(0, 10);

  const avgRuntime =
    recentSuccessful.length > 0
      ? recentSuccessful.reduce((sum, e) => sum + (new Date(e.stoppedAt!).getTime() - new Date(e.startedAt!).getTime()), 0) /
        recentSuccessful.length /
        1000
      : null;

  return {
    state: running ? "running" : mostRecent.status === "error" ? "failed" : mostRecent.status === "success" ? "idle" : "unknown",
    lastRun: mostRecent.startedAt ?? null,
    lastSuccess: lastSuccessExecution?.stoppedAt ?? null,
    currentJob: running ? `Execution #${running.id} (${running.mode ?? "running"})` : null,
    // Not obtainable from the Executions API without inspecting live node output -- honestly
    // left null rather than guessed.
    currentLead: null,
    averageRuntimeSeconds: avgRuntime,
    // n8n's public API doesn't expose queue depth outside queue-mode Bull/Redis internals --
    // honestly left null rather than guessed.
    queueSize: null,
  };
}

export async function fetchWorkflowStatusSafe(): Promise<{ configured: boolean; status: AutomationStatus | null; error?: string }> {
  if (!isAdminApiConfigured()) return { configured: false, status: null };
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
  if (!isAdminApiConfigured()) return { success: false, message: "n8n admin API is not configured." };
  try {
    await apiPatch(`/api/v1/workflows/${getConfig()!.workflowId}`, { active: false });
    return { success: true, message: "Workflow paused — scheduled sends and Run Campaign are both disabled until resumed." };
  } catch (err) {
    return { success: false, message: `Pause failed: ${readableError(err)}` };
  }
}

export async function resumeWorkflow(): Promise<TriggerResult> {
  if (!isAdminApiConfigured()) return { success: false, message: "n8n admin API is not configured." };
  try {
    await apiPatch(`/api/v1/workflows/${getConfig()!.workflowId}`, { active: true });
    return { success: true, message: "Workflow resumed." };
  } catch (err) {
    return { success: false, message: `Resume failed: ${readableError(err)}` };
  }
}

export async function isWorkflowActive(): Promise<boolean | null> {
  if (!isAdminApiConfigured()) return null;
  try {
    const data = await apiGet<{ active: boolean }>(`/api/v1/workflows/${getConfig()!.workflowId}`);
    return data.active;
  } catch {
    return null;
  }
}
