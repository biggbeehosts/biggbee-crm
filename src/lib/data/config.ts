import "server-only";

export interface SheetsEnv {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  sheetId: string;
}

export function getSheetsEnv(): SheetsEnv {
  return {
    projectId: process.env.GOOGLE_PROJECT_ID ?? "",
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL ?? "",
    // Sheets/env files store the private key with literal "\n" sequences -- turn them back into
    // real newlines, otherwise the JWT signer rejects the PEM block.
    privateKey: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
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
} as const;

export const CACHE_TTL_MS = 60_000;

export function maskSheetId(sheetId: string): string {
  if (!sheetId) return "";
  if (sheetId.length <= 8) return "••••••••";
  return `${sheetId.slice(0, 4)}••••••••${sheetId.slice(-4)}`;
}
