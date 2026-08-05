import "server-only";
import type { DemoRecord } from "@/types";
import { getDataMode, SHEET_TAB_NAMES } from "./config";
import { appendRow, ensureTabWithHeaders, fetchSheetRows, rowsToObjects, updateRowFields } from "./sheets-client";
import { normalizeDemoRecord } from "./normalize";
import { MOCK_DEMO_LIBRARY } from "@/lib/mock";
import { logAudit } from "@/lib/audit/log";
import { invalidateCache } from "./cache";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/**
 * Demo Library store (Stage 6, Part 6: the CRM is now the source of truth -- uploads go through
 * here, never a manual Sheet edit). Read path stays a live Sheet read on every call, same as
 * before; writes (createDemo/updateDemoMetadata/archiveDemo/replaceDemoVersion) are new.
 */

/** Additive-only -- see ensureTabWithHeaders (never reorders/removes the six pre-existing
 *  columns: Demo Type, Public Watch URL, Public Download URL, File Name, Thumbnail URL, Duration). */
const DEMO_LIBRARY_NEW_HEADERS = [
  "Demo ID",
  "Demo Name",
  "Service",
  "Business Type",
  "Industry",
  "Lead Generation Type",
  "Language",
  "Country",
  "MIME Type",
  "Active",
  "Priority",
  "Fallback Demo",
  "Version",
  "Archived",
  "Previous Version ID",
  "Storage Provider",
  "Storage Public ID",
  "Notes",
  "Created At",
  "Updated At",
];

let demoLibraryColumnsEnsured = false;
async function ensureDemoLibraryColumns(): Promise<void> {
  if (demoLibraryColumnsEnsured) return;
  await ensureTabWithHeaders(SHEET_TAB_NAMES.demoLibrary, DEMO_LIBRARY_NEW_HEADERS);
  demoLibraryColumnsEnsured = true;
}

function generateDemoId(existingIds: Iterable<string>): string {
  const idSet = existingIds instanceof Set ? existingIds : new Set(existingIds);
  let max = 0;
  for (const id of idSet) {
    const m = /^demo-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let next = max + 1;
  let candidate = `demo-${String(next).padStart(6, "0")}`;
  while (idSet.has(candidate)) {
    next += 1;
    candidate = `demo-${String(next).padStart(6, "0")}`;
  }
  return candidate;
}

/** Same pattern as campaigns-store.ts's migrateMissingCampaignIds -- assigns and persists a real
 *  demo-XXXXXX id for any row missing one, keyed by rowNumber, so it's stable from this point
 *  forward regardless of future row order changes. */
async function migrateMissingDemoIds(demos: DemoRecord[]): Promise<DemoRecord[]> {
  const missing = demos.filter((d) => !d.demoId && d.rowNumber);
  if (missing.length === 0) return demos;

  const assignedIds = new Set(demos.map((d) => d.demoId).filter(Boolean));
  const byRow = new Map(demos.map((d) => [d.rowNumber, d] as const));

  for (const d of missing) {
    const newId = generateDemoId(assignedIds);
    assignedIds.add(newId);
    await updateRowFields(SHEET_TAB_NAMES.demoLibrary, d.rowNumber!, { "Demo ID": newId });
    await logAudit({
      actor: "system",
      action: "demo.id_migrated",
      target: newId,
      success: true,
      details: { demoType: d.demoType, rowNumber: d.rowNumber },
    });
    byRow.set(d.rowNumber, { ...d, demoId: newId });
  }

  return demos.map((d) => byRow.get(d.rowNumber) ?? d);
}

async function getSheetDemoLibrary(): Promise<DemoRecord[]> {
  await ensureDemoLibraryColumns();
  const rows = await fetchSheetRows(SHEET_TAB_NAMES.demoLibrary);
  const objects = rowsToObjects(rows);
  const demos = objects.map(normalizeDemoRecord).filter((d) => d.demoType || d.publicWatchUrl || d.fileName);
  return migrateMissingDemoIds(demos);
}

export async function getDemoLibrary(): Promise<DemoRecord[]> {
  return getDataMode() === "mock" ? MOCK_DEMO_LIBRARY : getSheetDemoLibrary();
}

export async function getDemo(demoId: string): Promise<DemoRecord | undefined> {
  const all = await getDemoLibrary();
  return all.find((d) => d.demoId === demoId);
}

// ── mock-mode write support (Stage 6) ───────────────────────────────────────────────────────
// Sheets mode (production) is the real path below; mock mode gets a mutable local copy so
// `next build`/local dev with DATA_MODE=mock can still exercise upload/edit/archive without
// mutating the static MOCK_DEMO_LIBRARY fixture in place.
const MOCK_COLLECTION = "demo-library-mock";
async function getLocalDemos(): Promise<DemoRecord[]> {
  return readCollection<DemoRecord[]>(MOCK_COLLECTION, MOCK_DEMO_LIBRARY);
}
async function saveLocalDemos(demos: DemoRecord[]): Promise<void> {
  await writeCollection(MOCK_COLLECTION, demos);
}

function nowIso() {
  return new Date().toISOString();
}

/** Maps a DemoRecord onto Sheet header names -- only fields present in `demo` are included, so
 *  partial updates (updateDemoMetadata) never clobber columns they don't touch. */
function demoToRow(demo: Partial<DemoRecord>): Record<string, string> {
  const row: Record<string, string> = {};
  if (demo.demoId !== undefined) row["Demo ID"] = demo.demoId;
  if (demo.name !== undefined) row["Demo Name"] = demo.name;
  if (demo.demoType !== undefined) row["Demo Type"] = demo.demoType;
  if (demo.service !== undefined) row.Service = demo.service;
  if (demo.businessType !== undefined) row["Business Type"] = demo.businessType;
  if (demo.industry !== undefined) row.Industry = demo.industry;
  if (demo.leadGenerationType !== undefined) row["Lead Generation Type"] = demo.leadGenerationType;
  if (demo.language !== undefined) row.Language = demo.language;
  if (demo.country !== undefined) row.Country = demo.country;
  if (demo.publicWatchUrl !== undefined) row["Public Watch URL"] = demo.publicWatchUrl;
  if (demo.publicDownloadUrl !== undefined) row["Public Download URL"] = demo.publicDownloadUrl;
  if (demo.fileName !== undefined) row["File Name"] = demo.fileName;
  if (demo.mimeType !== undefined) row["MIME Type"] = demo.mimeType;
  if (demo.thumbnailUrl !== undefined) row["Thumbnail URL"] = demo.thumbnailUrl;
  if (demo.duration !== undefined) row.Duration = demo.duration;
  if (demo.active !== undefined) row.Active = demo.active ? "Yes" : "No";
  if (demo.priority !== undefined) row.Priority = String(demo.priority);
  if (demo.isFallback !== undefined) row["Fallback Demo"] = demo.isFallback ? "Yes" : "No";
  if (demo.version !== undefined) row.Version = String(demo.version);
  if (demo.archived !== undefined) row.Archived = demo.archived ? "Yes" : "No";
  if (demo.previousVersionId !== undefined) row["Previous Version ID"] = demo.previousVersionId;
  if (demo.storageProvider !== undefined) row["Storage Provider"] = demo.storageProvider;
  if (demo.storagePublicId !== undefined) row["Storage Public ID"] = demo.storagePublicId;
  if (demo.notes !== undefined) row.Notes = demo.notes;
  if (demo.createdAt !== undefined) row["Created At"] = demo.createdAt;
  if (demo.updatedAt !== undefined) row["Updated At"] = demo.updatedAt;
  return row;
}

async function findDemoRowUncached(demoId: string): Promise<DemoRecord | undefined> {
  const rows = await fetchSheetRows(SHEET_TAB_NAMES.demoLibrary);
  const objects = rowsToObjects(rows);
  const index = objects.findIndex((row) => (row["Demo ID"] ?? "").trim() === demoId);
  if (index === -1) return undefined;
  return normalizeDemoRecord(objects[index], index);
}

/** Generates the next free demo-XXXXXX id -- exported so upload actions can reserve an id (and
 *  therefore a Cloudinary public_id) before the file finishes uploading. */
export async function generateNextDemoId(): Promise<string> {
  const all = await getDemoLibrary();
  return generateDemoId(all.map((d) => d.demoId).filter(Boolean));
}

export type NewDemoInput = Omit<DemoRecord, "rowNumber" | "createdAt" | "updatedAt" | "version" | "archived"> & {
  version?: number;
  archived?: boolean;
};

/** Creates a brand-new demo row -- always an insert, never an update, so an existing demo can
 *  never be silently overwritten (Part 6 versioning). Used both for first-time uploads (version 1)
 *  and for replaceDemoVersion's new-row half. */
export async function createDemo(demo: NewDemoInput): Promise<DemoRecord> {
  const at = nowIso();
  const full: DemoRecord = { ...demo, version: demo.version ?? 1, archived: demo.archived ?? false, createdAt: at, updatedAt: at };

  if (getDataMode() === "mock") {
    const demos = await getLocalDemos();
    await saveLocalDemos([full, ...demos]);
    return full;
  }

  await ensureDemoLibraryColumns();
  await appendRow(SHEET_TAB_NAMES.demoLibrary, demoToRow(full));
  invalidateCache();
  await logAudit({ actor: "system", action: "demo.created", target: full.demoId, success: true, details: { service: full.service, industry: full.industry } });
  return full;
}

/** In-place metadata update (Service/Industry/Language/Priority/Active/Notes/etc.) -- never
 *  touches the video file or bumps the version, since correcting metadata isn't "replacing the
 *  demo" (see replaceDemoVersion for that). */
export async function updateDemoMetadata(demoId: string, fields: Partial<DemoRecord>): Promise<void> {
  const patch = { ...fields, updatedAt: nowIso() };

  if (getDataMode() === "mock") {
    const demos = await getLocalDemos();
    await saveLocalDemos(demos.map((d) => (d.demoId === demoId ? { ...d, ...patch } : d)));
    return;
  }

  await ensureDemoLibraryColumns();
  const current = await findDemoRowUncached(demoId);
  if (!current?.rowNumber) throw new Error(`Demo "${demoId}" was not found in the Demo Library sheet.`);
  await updateRowFields(SHEET_TAB_NAMES.demoLibrary, current.rowNumber, demoToRow(patch), { header: "Demo ID", value: demoId });
  invalidateCache();
}

export async function archiveDemo(demoId: string): Promise<void> {
  await updateDemoMetadata(demoId, { active: false, archived: true });
  await logAudit({ actor: "system", action: "demo.archived", target: demoId, success: true });
}

/**
 * Replaces a demo's video with a new upload without ever overwriting the old row (Part 6
 * versioning): archives `oldDemoId` in place, then creates a fresh row carrying the new file,
 * `version = old.version + 1`, and `previousVersionId = oldDemoId`. The old row's Demo ID (and
 * therefore any lead that already referenced it) keeps working exactly as before -- only new
 * matching picks up the replacement, since matching filters out archived rows.
 */
export async function replaceDemoVersion(oldDemoId: string, newDemo: Omit<NewDemoInput, "previousVersionId" | "version">): Promise<DemoRecord> {
  const old = await getDemo(oldDemoId);
  const nextVersion = (old?.version ?? 1) + 1;
  await archiveDemo(oldDemoId);
  return createDemo({ ...newDemo, previousVersionId: oldDemoId, version: nextVersion });
}
