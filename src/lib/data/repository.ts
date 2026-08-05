import "server-only";
import type { ErrorRecord, KnowledgeBaseRecord, Lead, LeadMemory, UnknownSender } from "@/types";
import { MOCK_ERRORS, MOCK_KNOWLEDGE_BASE, MOCK_LEAD_MEMORY, MOCK_UNKNOWN_SENDERS } from "@/lib/mock";
import { getDataMode, SHEET_TAB_NAMES, getSheetsEnv, maskSheetId, getMissingSheetsEnv } from "./config";
import { fetchSheetRows, rowsToObjects } from "./sheets-client";
import { normalizeErrorRecord, normalizeKnowledgeBase, normalizeLead, normalizeLeadMemory, normalizeUnknownSender } from "./normalize";
import { getCached, getLastSyncAt, invalidateCache } from "./cache";
import { getMockLeads } from "./mock-store";
import type { ConnectionStatus } from "@/types";

let lastSheetsError: string | null = null;

async function loadTab(tabKey: keyof typeof SHEET_TAB_NAMES) {
  const tabName = SHEET_TAB_NAMES[tabKey];
  return getCached(`tab:${tabKey}`, async () => {
    const rows = await fetchSheetRows(tabName);
    return rowsToObjects(rows);
  });
}

async function safeLoadTab(tabKey: keyof typeof SHEET_TAB_NAMES) {
  try {
    const rows = await loadTab(tabKey);
    lastSheetsError = null;
    return rows;
  } catch (err) {
    lastSheetsError = err instanceof Error ? err.message : "Unknown Google Sheets error";
    throw err;
  }
}

// In sheets mode a failed read returns EMPTY data, never mock data -- silently showing sample
// rows while the operator believes they're looking at the live sheet would be worse than an
// empty page. The sidebar status indicator and Settings surface the connection error.

export async function getLeads(): Promise<Lead[]> {
  if (getDataMode() === "mock") return getMockLeads();
  try {
    const rows = await safeLoadTab("leads");
    return rows.map(normalizeLead).filter((l) => l.email);
  } catch {
    return [];
  }
}

export async function getLeadMemory(): Promise<LeadMemory[]> {
  if (getDataMode() === "mock") return MOCK_LEAD_MEMORY;
  try {
    const rows = await safeLoadTab("leadMemory");
    return rows.map(normalizeLeadMemory).filter((m) => m.email);
  } catch {
    return [];
  }
}

export async function getErrors(): Promise<ErrorRecord[]> {
  if (getDataMode() === "mock") return MOCK_ERRORS;
  try {
    const rows = await safeLoadTab("errors");
    return rows.map(normalizeErrorRecord);
  } catch {
    return [];
  }
}

function emptyKb(cacheKey: string): KnowledgeBaseRecord {
  return { cacheKey, knowledgeBaseText: "", updatedAt: null, sourceCount: 0, sections: [] };
}

/** cacheKey defaults to "latest" -- the pre-Stage-6 default site -- so every existing caller is
 *  unaffected. Stage 6, Part 8 callers pass a specific website's cacheKey to read that site's KB
 *  instead. */
export async function getKnowledgeBase(cacheKey: string = "latest"): Promise<KnowledgeBaseRecord> {
  if (getDataMode() === "mock") return cacheKey === "latest" ? MOCK_KNOWLEDGE_BASE : emptyKb(cacheKey);
  try {
    const rows = await safeLoadTab("kbCache");
    return normalizeKnowledgeBase(rows, cacheKey);
  } catch {
    return emptyKb(cacheKey);
  }
}

export async function getUnknownSenders(): Promise<UnknownSender[]> {
  if (getDataMode() === "mock") return MOCK_UNKNOWN_SENDERS;
  try {
    const rows = await safeLoadTab("unknownSenders");
    // Internal/system mail (office@ report loop, DSNs, etc.) is classified but never surfaced as a
    // prospect "Unknown Sender" -- see normalizeUnknownSender's doc comment; this is the filter it
    // describes but that was missing here.
    return rows
      .map((row, i) => normalizeUnknownSender(row, i))
      .filter((u) => u.fromEmail && u.classification !== "Internal");
  } catch {
    return [];
  }
}

export function refreshAllData() {
  invalidateCache();
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const mode = getDataMode();
  if (mode === "mock") {
    return { connected: true, mode: "mock" };
  }
  const env = getSheetsEnv();
  const missingEnv = getMissingSheetsEnv();
  try {
    await safeLoadTab("leads");
    const syncedAt = getLastSyncAt("tab:leads");
    return {
      connected: true,
      mode: "google-sheets",
      spreadsheetIdMasked: maskSheetId(env.sheetId),
      lastSuccessfulSync: syncedAt ? new Date(syncedAt).toISOString() : null,
    };
  } catch (err) {
    return {
      connected: false,
      mode: "google-sheets",
      spreadsheetIdMasked: maskSheetId(env.sheetId),
      error: lastSheetsError ?? (err instanceof Error ? err.message : "Unknown error"),
      missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
    };
  }
}

export function isUsingMockData(): boolean {
  return getDataMode() === "mock";
}
