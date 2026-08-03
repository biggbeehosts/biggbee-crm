import "server-only";
import type { UnknownSenderClassification } from "@/types";
import { getDataMode, SHEET_TAB_NAMES } from "./config";
import { ensureTabWithHeaders, fetchSheetRows, rowsToObjects, updateRowFields, deleteSheetRow } from "./sheets-client";
import { normalizeUnknownSender } from "./normalize";
import { invalidateCache } from "./cache";

const NEW_HEADERS = ["Reviewed", "Classification"];

let ensured = false;
async function ensureColumns(): Promise<void> {
  if (ensured) return;
  await ensureTabWithHeaders(SHEET_TAB_NAMES.unknownSenders, NEW_HEADERS);
  ensured = true;
}

async function findRowUncached(fromEmail: string, timestamp: string | null) {
  const rows = await fetchSheetRows(SHEET_TAB_NAMES.unknownSenders);
  const objects = rowsToObjects(rows);
  const normalized = objects.map((row, i) => normalizeUnknownSender(row, i));
  return normalized.find((r) => r.fromEmail === fromEmail && r.timestamp === timestamp);
}

async function patchRow(fromEmail: string, timestamp: string | null, fields: Record<string, string>): Promise<void> {
  if (getDataMode() === "mock") return; // mock mode has no backing sheet row to patch
  await ensureColumns();
  const current = await findRowUncached(fromEmail, timestamp);
  if (!current?.rowNumber) throw new Error("This record was not found in the Unknown_Senders sheet -- it may have been deleted already.");
  await updateRowFields(SHEET_TAB_NAMES.unknownSenders, current.rowNumber, fields, { header: "From Email", value: current.fromEmail });
  invalidateCache();
}

export async function markSenderReviewed(fromEmail: string, timestamp: string | null, reviewed: boolean): Promise<void> {
  await patchRow(fromEmail, timestamp, { Reviewed: reviewed ? "Yes" : "No" });
}

export async function reclassifySender(fromEmail: string, timestamp: string | null, classification: UnknownSenderClassification): Promise<void> {
  await patchRow(fromEmail, timestamp, { Classification: classification, Reviewed: "Yes" });
}

export async function deleteSenderRecord(fromEmail: string, timestamp: string | null): Promise<void> {
  if (getDataMode() === "mock") return;
  await ensureColumns();
  const current = await findRowUncached(fromEmail, timestamp);
  if (!current?.rowNumber) throw new Error("This record was not found in the Unknown_Senders sheet -- it may have been deleted already.");
  await deleteSheetRow(SHEET_TAB_NAMES.unknownSenders, current.rowNumber);
  invalidateCache();
}
