import "server-only";
import { readCollection, updateCollection } from "@/lib/store/json-store";

/** CRM-owned sync-attempt log for the Website Registry (Stage 6, Part 8 "Queue") -- same pattern
 *  as demo-upload-log-store.ts. Real, observed outcomes only, capped so it never grows unbounded. */

export interface WebsiteSyncLogEntry {
  id: string;
  websiteId: string;
  websiteLabel: string;
  outcome: "success" | "failure";
  message: string;
  at: string;
}

const COLLECTION = "website-sync-log";
const MAX_ENTRIES = 200;

export async function recordSyncAttempt(entry: Omit<WebsiteSyncLogEntry, "id">): Promise<void> {
  const full: WebsiteSyncLogEntry = { ...entry, id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  await updateCollection<WebsiteSyncLogEntry[]>(COLLECTION, [], (current) => [full, ...current].slice(0, MAX_ENTRIES));
}

export function getSyncLog(websiteId?: string): WebsiteSyncLogEntry[] {
  const all = readCollection<WebsiteSyncLogEntry[]>(COLLECTION, []);
  return websiteId ? all.filter((e) => e.websiteId === websiteId) : all;
}
