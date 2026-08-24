import "server-only";
import type { ErrorRecord, KnowledgeBaseRecord, Lead, LeadMemory, UnknownSender } from "@/types";
import { MOCK_ERRORS, MOCK_KNOWLEDGE_BASE, MOCK_LEAD_MEMORY, MOCK_UNKNOWN_SENDERS } from "@/lib/mock";
import { getDataMode, SHEET_TAB_NAMES, getSheetsEnv, maskSheetId, getMissingSheetsEnv } from "./config";
import { fetchSheetRows, rowsToObjects } from "./sheets-client";
import { normalizeErrorRecord, normalizeKnowledgeBase, normalizeLead, normalizeLeadMemory, normalizeUnknownSender } from "./normalize";
import { getCached, getLastSyncAt, invalidateCache } from "./cache";
import { getMockLeads, getAllMockLeadsUnfiltered } from "./mock-store";
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

/** workspaceId is required -- there is no unscoped overload. Every caller must know which
 *  workspace it's reading for; see types/lead.ts on why email alone is never a safe filter. */
export async function getLeads(workspaceId: string): Promise<Lead[]> {
  if (getDataMode() === "mock") return getMockLeads(workspaceId);
  try {
    const rows = await safeLoadTab("leads");
    return rows.map(normalizeLead).filter((l) => l.email && l.workspaceId === workspaceId);
  } catch {
    return [];
  }
}

export async function getLeadMemory(workspaceId: string): Promise<LeadMemory[]> {
  if (getDataMode() === "mock") return MOCK_LEAD_MEMORY.filter((m) => m.workspaceId === workspaceId);
  try {
    const rows = await safeLoadTab("leadMemory");
    return rows.map(normalizeLeadMemory).filter((m) => m.email && m.workspaceId === workspaceId);
  } catch {
    return [];
  }
}

export async function getErrors(workspaceId: string): Promise<ErrorRecord[]> {
  if (getDataMode() === "mock") return MOCK_ERRORS.filter((e) => e.workspaceId === workspaceId);
  try {
    const rows = await safeLoadTab("errors");
    return rows.map(normalizeErrorRecord).filter((e) => e.workspaceId === workspaceId);
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

export async function getUnknownSenders(workspaceId: string): Promise<UnknownSender[]> {
  if (getDataMode() === "mock") return MOCK_UNKNOWN_SENDERS.filter((u) => u.workspaceId === workspaceId);
  try {
    const rows = await safeLoadTab("unknownSenders");
    // Internal/system mail (office@ report loop, DSNs, etc.) is classified but never surfaced as a
    // prospect "Unknown Sender" -- see normalizeUnknownSender's doc comment; this is the filter it
    // describes but that was missing here.
    return rows
      .map((row, i) => normalizeUnknownSender(row, i))
      .filter((u) => u.fromEmail && u.classification !== "Internal" && u.workspaceId === workspaceId);
  } catch {
    return [];
  }
}

/**
 * The one legitimate cross-workspace lead lookup: the tracking pixel/click-redirect routes only
 * ever have an opaque per-send trackingToken to go on, never a workspaceId (there is nothing in
 * a `/api/track/*` URL to resolve one from). A trackingToken is unique to exactly one lead by
 * construction (see n8n's randomOpaqueToken), so scanning across every workspace to find its one
 * match is safe -- this is a narrow, single-purpose lookup, not a general unscoped "list every
 * lead" escape hatch, and returns at most one row. Once found, `lead.workspaceId` is the real
 * answer for every subsequent scoped call (getCampaign, updateLeadFields, ...) in that request.
 */
export async function findLeadByTrackingToken(token: string): Promise<Lead | undefined> {
  if (getDataMode() === "mock") return getAllMockLeadsUnfiltered().find((l) => l.trackingToken === token);
  try {
    const rows = await safeLoadTab("leads");
    return rows.map(normalizeLead).find((l) => l.email && l.trackingToken === token);
  } catch {
    return undefined;
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
