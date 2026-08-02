import "server-only";
import { getN8nApiKey, getWebhookUrl, N8N_ACTION_LABELS, type N8nActionKey } from "./config";
import { EMPTY_STATUS, type AutomationStatus, type TriggerResult, type WorkflowState } from "./types";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Thin webhook client. The CRM never runs workflow logic -- it POSTs a trigger, reads the
 * response, and lets n8n do everything else. Long-running workflows should use n8n's
 * "Respond immediately" webhook mode so this call returns fast; the Google Sheet is the source
 * of truth for results either way.
 */
async function postWebhook(url: string, payload: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getN8nApiKey();
  if (apiKey) {
    // Covers both common n8n Header-Auth setups without extra configuration.
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-KEY"] = apiKey;
  }
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
}

/** Converts any failure into an operator-readable message. Raw stacks never leave the server. */
function readableError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "n8n did not respond within 30 seconds. If the workflow runs longer, set its webhook to respond immediately.";
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
      return "Could not reach n8n. Check N8N_BASE_URL and that the n8n instance is running.";
    }
  }
  return "The webhook call failed unexpectedly. Check the n8n execution log for details.";
}

export async function triggerWebhook(action: N8nActionKey, payload: Record<string, unknown> = {}): Promise<TriggerResult> {
  const label = N8N_ACTION_LABELS[action];
  const url = getWebhookUrl(action);
  if (!url) {
    return { success: false, message: `Webhook not configured — set the ${label} URL in .env.local to enable this action.` };
  }

  try {
    const res = await postWebhook(url, { triggeredBy: "biggbee-crm", action, timestamp: new Date().toISOString(), ...payload });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: `${label} was rejected by n8n (authentication). Check N8N_API_KEY.` };
      }
      if (res.status === 404) {
        return { success: false, message: `${label} webhook was not found. Check the webhook path and that the workflow is active in n8n.` };
      }
      return { success: false, message: `${label} failed — n8n responded with HTTP ${res.status}.` };
    }
    return { success: true, message: `${label} triggered. n8n is handling it; results land in the Google Sheet.` };
  } catch (err) {
    return { success: false, message: `${label} failed: ${readableError(err)}` };
  }
}

function normalizeState(value: unknown): WorkflowState {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "running" || s === "active" || s === "busy") return "running";
  if (s === "idle" || s === "waiting" || s === "ok") return "idle";
  if (s === "failed" || s === "error") return "failed";
  return "unknown";
}

function str(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches the status snapshot from the optional n8n status workflow. Field names are matched
 * leniently (camelCase or snake_case) and anything missing becomes null.
 */
export async function fetchAutomationStatus(): Promise<AutomationStatus | null> {
  const url = getWebhookUrl("status");
  if (!url) return null;

  const res = await postWebhook(url, { triggeredBy: "biggbee-crm", action: "status" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  const data = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return { ...EMPTY_STATUS };

  return {
    state: normalizeState(data.state ?? data.status ?? data.workflowStatus),
    lastRun: str(data.lastRun ?? data.last_run),
    currentJob: str(data.currentJob ?? data.current_job),
    currentLead: str(data.currentLead ?? data.current_lead),
    lastSuccess: str(data.lastSuccess ?? data.last_success),
    averageRuntimeSeconds: num(data.averageRuntimeSeconds ?? data.average_runtime_seconds ?? data.avgRuntime),
    queueSize: num(data.queueSize ?? data.queue_size),
  };
}
