import "server-only";
import { getWebhookUrlFromRaw } from "@/lib/n8n/config";
import { SHEET_FIELDS } from "./core.mjs";

/**
 * Website Redesign Outreach configuration. EVERYTHING here is its own set of environment
 * variables (REDESIGN_* and N8N_WEBHOOK_REDESIGN) -- none of the general cold-email settings
 * (N8N_WEBHOOK_RUN_CAMPAIGN, GOOGLE_SHEET_ID, ...) are read or fallen back to for the webhook,
 * the sheet, or the Drive folder. A missing value means "not configured": the page says so
 * instead of guessing. Nothing in this file is ever sent to the browser -- callers expose only
 * the booleans/labels from describeConfig().
 *
 * Workspace isolation: this config belongs to exactly ONE workspace (REDESIGN_WORKSPACE_ID,
 * default "biggbee"). Every other workspace resolves to "not configured", so a second workspace
 * can never read Biggbee's redesign sheet or Drive folder; it needs its own config first.
 */

export const DEFAULT_REDESIGN_WORKSPACE_ID = "biggbee";

export interface RedesignSettings {
  /** Seconds between live sends (a pacing control, not a spam-protection claim). */
  delaySeconds: number;
  maxScreenshots: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  ignoreNonImageFiles: boolean;
  /** The provider's VERIFIED limits -- no default on purpose; live sending is blocked until set. */
  providerHourlyLimit: number;
  providerDailyLimit: number;
  hourlyLimit: number;
  dailyLimit: number;
  maxPerRun: number;
  bounceRateThreshold: number;
  minSampleForBounce: number;
  maxConsecutiveErrors: number;
}

export interface RedesignConfig {
  workspaceId: string;
  webhookUrl: string | null;
  sheetId: string;
  leadsTab: string;
  trackingTab: string;
  driveFolderId: string;
  columnMap: Record<string, string>;
  columnMapError: string | null;
  eligibleStatuses: string[];
  settings: RedesignSettings;
}

function intEnv(name: string, fallback: number, min = 0): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseColumnMap(raw: string): { map: Record<string, string>; error: string | null } {
  if (!raw.trim()) return { map: {}, error: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { map: {}, error: "REDESIGN_SHEET_COLUMNS must be a JSON object." };
    const known = new Set([...SHEET_FIELDS.required, ...SHEET_FIELDS.optional]);
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!known.has(k)) return { map: {}, error: `REDESIGN_SHEET_COLUMNS has an unknown field "${k}".` };
      if (typeof v !== "string") return { map: {}, error: `REDESIGN_SHEET_COLUMNS["${k}"] must be a header name (string).` };
      if (v.trim()) map[k] = v.trim();
    }
    return { map, error: null };
  } catch {
    return { map: {}, error: "REDESIGN_SHEET_COLUMNS is not valid JSON." };
  }
}

export function getRedesignWorkspaceId(): string {
  return (process.env.REDESIGN_WORKSPACE_ID ?? "").trim() || DEFAULT_REDESIGN_WORKSPACE_ID;
}

/** Returns the config for this workspace, or null when the workspace is not the one the redesign
 *  integration is configured for. */
export function getRedesignConfig(workspaceId: string): RedesignConfig | null {
  if (workspaceId !== getRedesignWorkspaceId()) return null;
  const { map, error } = parseColumnMap(process.env.REDESIGN_SHEET_COLUMNS ?? "");
  const providerHourlyLimit = intEnv("REDESIGN_PROVIDER_HOURLY_LIMIT", 0);
  const providerDailyLimit = intEnv("REDESIGN_PROVIDER_DAILY_LIMIT", 0);
  // Campaign limits can only ever be tightened below the verified provider limits.
  const clamp = (value: number, ceiling: number) => (ceiling > 0 ? Math.min(value, ceiling) : 0);
  return {
    workspaceId,
    webhookUrl: getWebhookUrlFromRaw(process.env.N8N_WEBHOOK_REDESIGN ?? ""),
    sheetId: (process.env.REDESIGN_SHEET_ID ?? "").trim(),
    leadsTab: (process.env.REDESIGN_SHEET_LEADS_TAB ?? "").trim(),
    trackingTab: (process.env.REDESIGN_SHEET_TRACKING_TAB ?? "").trim(),
    driveFolderId: (process.env.REDESIGN_DRIVE_FOLDER_ID ?? "").trim(),
    columnMap: map,
    columnMapError: error,
    eligibleStatuses: (process.env.REDESIGN_ELIGIBLE_STATUSES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    settings: {
      delaySeconds: intEnv("REDESIGN_DELAY_SECONDS", 120, 5),
      maxScreenshots: intEnv("REDESIGN_MAX_SCREENSHOTS", 4, 1),
      maxFileBytes: intEnv("REDESIGN_MAX_FILE_BYTES", 4 * 1024 * 1024, 1),
      maxTotalBytes: intEnv("REDESIGN_MAX_TOTAL_BYTES", 10 * 1024 * 1024, 1),
      ignoreNonImageFiles: (process.env.REDESIGN_IGNORE_NON_IMAGE_FILES ?? "").trim().toLowerCase() === "true",
      providerHourlyLimit,
      providerDailyLimit,
      hourlyLimit: clamp(intEnv("REDESIGN_HOURLY_LIMIT", providerHourlyLimit), providerHourlyLimit),
      dailyLimit: clamp(intEnv("REDESIGN_DAILY_LIMIT", providerDailyLimit), providerDailyLimit),
      maxPerRun: intEnv("REDESIGN_MAX_PER_RUN", 50, 1),
      bounceRateThreshold: floatEnv("REDESIGN_BOUNCE_RATE_THRESHOLD", 0.05),
      minSampleForBounce: intEnv("REDESIGN_MIN_BOUNCE_SAMPLE", 20, 1),
      maxConsecutiveErrors: intEnv("REDESIGN_MAX_CONSECUTIVE_ERRORS", 3, 1),
    },
  };
}

export interface ConfigItem {
  key: string;
  label: string;
  envVar: string;
  configured: boolean;
  hint: string;
}

/** Browser-safe description: names of the settings and whether each is set -- never a value. */
export function describeConfig(config: RedesignConfig | null): { workspaceConfigured: boolean; items: ConfigItem[]; ready: boolean; liveReady: boolean; liveBlockers: string[] } {
  if (!config) return { workspaceConfigured: false, items: [], ready: false, liveReady: false, liveBlockers: ["Website Redesign Outreach is not configured for this workspace."] };
  const items: ConfigItem[] = [
    { key: "webhook", label: "Dedicated n8n webhook", envVar: "N8N_WEBHOOK_REDESIGN", configured: !!config.webhookUrl, hint: "Path or full URL of the Website Redesign workflow's own webhook (not the Run Campaign webhook)." },
    { key: "sheet", label: "Dedicated Google Sheet", envVar: "REDESIGN_SHEET_ID", configured: !!config.sheetId, hint: "Spreadsheet ID of the redesign leads sheet (separate from the general CRM sheet)." },
    { key: "leadsTab", label: "Leads tab", envVar: "REDESIGN_SHEET_LEADS_TAB", configured: !!config.leadsTab, hint: "Exact tab name holding one row per business." },
    { key: "trackingTab", label: "Tracking tab", envVar: "REDESIGN_SHEET_TRACKING_TAB", configured: !!config.trackingTab, hint: "Tab the workflow writes status rows to (see docs for the required header row)." },
    { key: "drive", label: "Drive main folder", envVar: "REDESIGN_DRIVE_FOLDER_ID", configured: !!config.driveFolderId, hint: "ID of the main folder whose subfolders hold each business's screenshots." },
    { key: "columns", label: "Sheet column mapping", envVar: "REDESIGN_SHEET_COLUMNS", configured: !config.columnMapError && SHEET_FIELDS.required.every((f) => !!config.columnMap[f]), hint: config.columnMapError ?? "JSON mapping of businessName/email (required) and optional fields to the sheet's real header names." },
  ];
  const ready = items.every((i) => i.configured);
  const liveBlockers: string[] = [];
  if (!ready) liveBlockers.push("Finish the configuration above first.");
  if (config.settings.providerHourlyLimit <= 0 || config.settings.providerDailyLimit <= 0) {
    liveBlockers.push("Enter your email provider's verified hourly and daily sending limits (REDESIGN_PROVIDER_HOURLY_LIMIT / REDESIGN_PROVIDER_DAILY_LIMIT) before live sending.");
  }
  return { workspaceConfigured: true, items, ready, liveReady: ready && liveBlockers.length === 0, liveBlockers };
}
