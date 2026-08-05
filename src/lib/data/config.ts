import "server-only";

export interface SheetsEnv {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  sheetId: string;
}

/**
 * Normalizes a private-key value that may have reached process.env via two different
 * env-file parsers depending on how the app is run:
 *  - Next's own dotenv-compatible loader (local dev, `next dev` reading .env.local) and modern
 *    Docker Compose (v2, godotenv-based `env_file:`) both strip a surrounding quote pair AND
 *    expand literal "\n" to a real newline themselves -- the value already arrives clean.
 *  - Older/naive env_file parsers do neither: the literal `"..."` characters AND the literal
 *    two-character `\n` sequences both survive into process.env untouched.
 * Since we can't assume which parser touched the value, handle both: strip one matching pair of
 * surrounding quotes if present, then convert any remaining literal "\n" to a real newline.
 * Idempotent -- running this on an already-clean value is a no-op.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (key.length >= 2 && ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

export function getSheetsEnv(): SheetsEnv {
  return {
    projectId: process.env.GOOGLE_PROJECT_ID ?? "",
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL ?? "",
    privateKey: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY ?? ""),
    sheetId: process.env.GOOGLE_SHEET_ID ?? "",
  };
}

export function isSheetsConfigured(): boolean {
  const env = getSheetsEnv();
  return Boolean(env.clientEmail && env.privateKey && env.sheetId);
}

/**
 * Which required Google variables are still empty. Used to give the operator an actionable
 * message instead of a cryptic googleapis auth error when DATA_MODE=sheets but nothing is set.
 * GOOGLE_PROJECT_ID is not required to authenticate a JWT service account, so it is not listed.
 */
export function getMissingSheetsEnv(): string[] {
  const env = getSheetsEnv();
  const missing: string[] = [];
  if (!env.clientEmail) missing.push("GOOGLE_CLIENT_EMAIL");
  if (!env.privateKey) missing.push("GOOGLE_PRIVATE_KEY");
  if (!env.sheetId) missing.push("GOOGLE_SHEET_ID");
  return missing;
}

export type DataMode = "mock" | "google-sheets";

/**
 * DATA_MODE=mock forces mock data even with credentials present; DATA_MODE=sheets forces live
 * Google Sheets. Unset falls back to auto-detection from credentials, so existing setups keep
 * working unchanged.
 */
export function getDataMode(): DataMode {
  const explicit = (process.env.DATA_MODE ?? "").trim().toLowerCase();
  if (explicit === "mock") return "mock";
  if (explicit === "sheets") return "google-sheets";
  return isSheetsConfigured() ? "google-sheets" : "mock";
}

/** Sheet tab names -- override via env if a customer's spreadsheet uses different tab names. */
export const SHEET_TAB_NAMES = {
  leads: process.env.SHEET_TAB_LEADS || "Leads",
  leadMemory: process.env.SHEET_TAB_LEAD_MEMORY || "Lead_Memory",
  demoLibrary: process.env.SHEET_TAB_DEMO_LIBRARY || "Demo_Library",
  errors: process.env.SHEET_TAB_ERRORS || "Errors",
  kbCache: process.env.SHEET_TAB_KB_CACHE || "KB_Cache",
  unknownSenders: process.env.SHEET_TAB_UNKNOWN_SENDERS || "Unknown_Senders",
  // New tab, created on first write via ensureTabWithHeaders() -- not part of the six tabs the
  // n8n workflow maintains, owned entirely by the CRM.
  campaigns: process.env.SHEET_TAB_CAMPAIGNS || "Campaigns",
  // Scraping job records (Change 2) -- created/updated by the CRM after each scraper run
  // completes, never written by n8n directly.
  scrapingJobs: process.env.SHEET_TAB_SCRAPING_JOBS || "Scraping_Jobs",
  // Website Registry (Stage 6, Part 8/9) -- CRM-owned, source of truth for what the generic
  // n8n crawler subflow iterates over. n8n reads this tab; only the CRM writes to it.
  websites: process.env.SHEET_TAB_WEBSITES || "Websites",
} as const;

export const CACHE_TTL_MS = 60_000;

export function maskSheetId(sheetId: string): string {
  if (!sheetId) return "";
  if (sheetId.length <= 8) return "••••••••";
  return `${sheetId.slice(0, 4)}••••••••${sheetId.slice(-4)}`;
}
