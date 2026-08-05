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

/** "Open in n8n" link target (Part B) -- N8N_BASE_URL is a hostname, not a secret, so it's safe
 *  to hand a fully-formed link to the browser; the API keys never travel this way. Returns null
 *  when N8N_BASE_URL or the workflow ID isn't set, so the button can be hidden/disabled honestly. */
export function getN8nEditorUrl(workflowId: string): string | null {
  const base = getN8nBaseUrl();
  if (!base || !workflowId.trim()) return null;
  return `${base}/workflow/${encodeURIComponent(workflowId)}`;
}

/** Part F: the Advanced Workflow Update section is disabled by default -- opt in explicitly. */
export function isAdvancedUpdatesEnabled(): boolean {
  return (process.env.ADVANCED_WORKFLOW_UPDATES_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Joins a bare path onto N8N_BASE_URL, or passes a full URL through unchanged. Shared by the
 *  fixed action webhooks above and by scraper-agent webhook resolution below. */
function joinOrPassThrough(raw: string): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = getN8nBaseUrl();
  if (!base) return null;
  return `${base}/${raw.replace(/^\/+/, "")}`;
}

/** Resolves an action to its full webhook URL, or null when not configured. */
export function getWebhookUrl(action: N8nActionKey): string | null {
  return joinOrPassThrough((ENV_BY_ACTION[action] ?? "").trim());
}

export function isActionConfigured(action: N8nActionKey): boolean {
  return getWebhookUrl(action) !== null;
}

/**
 * Whether `url`'s host matches N8N_BASE_URL's host -- the guardrail behind Part B's "do not allow
 * arbitrary browser-supplied external URLs to be invoked directly." A bare path (joined onto
 * N8N_BASE_URL by joinOrPassThrough) always passes trivially; only a full URL entered directly
 * needs checking. Returns false (never throws) on a malformed URL or an unconfigured base.
 */
export function isAllowedN8nHost(url: string): boolean {
  const base = getN8nBaseUrl();
  if (!base) return false;
  try {
    return new URL(url).host === new URL(base).host;
  } catch {
    return false;
  }
}

/**
 * Resolves a scraper agent's start webhook to a callable URL. `startWebhookEnvVar`, when set,
 * takes priority -- it's a *reference* to an env var name (e.g. "N8N_WEBHOOK_SCRAPE_GOOGLE_MAPS"),
 * resolved here server-side; the registry record itself never holds the value. Falls back to
 * `startWebhookPath` (already host-validated at creation time in the scrapers server action).
 */
export function resolveScraperWebhookUrl(agent: { startWebhookPath: string; startWebhookEnvVar?: string }): string | null {
  if (agent.startWebhookEnvVar) {
    const envValue = (process.env[agent.startWebhookEnvVar] ?? "").trim();
    if (envValue) return joinOrPassThrough(envValue);
  }
  return joinOrPassThrough(agent.startWebhookPath.trim());
}
