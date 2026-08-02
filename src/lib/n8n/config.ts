import "server-only";

/**
 * n8n webhook configuration. All URLs come from environment variables -- nothing is hardcoded.
 * Each entry may be a full URL or a path that is joined onto N8N_BASE_URL. A missing value means
 * "not configured": the UI says so honestly instead of faking execution.
 *
 * Adding a new workflow later = one new env var + one new entry here. Nothing else changes.
 */

export type N8nActionKey =
  | "runCampaign"
  | "pauseCampaign"
  | "resumeCampaign"
  | "refreshKb"
  | "retryFailed"
  | "sync"
  | "status";

const ENV_BY_ACTION: Record<N8nActionKey, string | undefined> = {
  runCampaign: process.env.N8N_WEBHOOK_RUN_CAMPAIGN,
  pauseCampaign: process.env.N8N_WEBHOOK_PAUSE_CAMPAIGN,
  resumeCampaign: process.env.N8N_WEBHOOK_RESUME_CAMPAIGN,
  refreshKb: process.env.N8N_WEBHOOK_REFRESH_KB,
  retryFailed: process.env.N8N_WEBHOOK_RETRY_FAILED,
  sync: process.env.N8N_WEBHOOK_SYNC,
  status: process.env.N8N_WEBHOOK_STATUS,
};

export const N8N_ACTION_LABELS: Record<N8nActionKey, string> = {
  runCampaign: "Run Campaign",
  pauseCampaign: "Pause Campaign",
  resumeCampaign: "Resume Campaign",
  refreshKb: "Refresh Knowledge Base",
  retryFailed: "Retry Failed Leads",
  sync: "Sync CRM",
  status: "Workflow Status",
};

export function getN8nBaseUrl(): string {
  return (process.env.N8N_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

export function getN8nApiKey(): string {
  return (process.env.N8N_API_KEY ?? "").trim();
}

/** Resolves an action to its full webhook URL, or null when not configured. */
export function getWebhookUrl(action: N8nActionKey): string | null {
  const raw = (ENV_BY_ACTION[action] ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getN8nBaseUrl();
  if (!base) return null;
  return `${base}/${raw.replace(/^\/+/, "")}`;
}

export function isActionConfigured(action: N8nActionKey): boolean {
  return getWebhookUrl(action) !== null;
}
