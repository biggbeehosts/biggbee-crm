import "server-only";
import { readCollection, updateCollection } from "@/lib/store/json-store";

/** CRM-owned upload attempt log (Stage 6, Part 6 "Storage Health") -- real, observed outcomes
 *  only, never inferred. Capped so this never grows unbounded like a runaway event log. */

export interface UploadLogEntry {
  id: string;
  demoId?: string;
  fileName: string;
  outcome: "success" | "failure";
  errorMessage?: string;
  bytes?: number;
  at: string;
}

const COLLECTION = "demo-upload-log";
const MAX_ENTRIES = 500;

export async function recordUploadAttempt(entry: Omit<UploadLogEntry, "id">): Promise<void> {
  const full: UploadLogEntry = { ...entry, id: `upl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  await updateCollection<UploadLogEntry[]>(COLLECTION, [], (current) => [full, ...current].slice(0, MAX_ENTRIES));
}

export function getUploadLog(): UploadLogEntry[] {
  return readCollection<UploadLogEntry[]>(COLLECTION, []);
}

export interface UploadLogSummary {
  uploadsToday: number;
  lastUpload: UploadLogEntry | null;
  lastFailure: UploadLogEntry | null;
}

export function summarizeUploadLog(): UploadLogSummary {
  const log = getUploadLog();
  const todayKey = new Date().toISOString().slice(0, 10);
  const uploadsToday = log.filter((e) => e.outcome === "success" && e.at.slice(0, 10) === todayKey).length;
  const lastUpload = log.find((e) => e.outcome === "success") ?? null;
  const lastFailure = log.find((e) => e.outcome === "failure") ?? null;
  return { uploadsToday, lastUpload, lastFailure };
}
