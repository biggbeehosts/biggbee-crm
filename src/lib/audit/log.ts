import "server-only";
import { updateCollection, readCollection } from "@/lib/store/json-store";

const COLLECTION = "audit-log";
const MAX_ENTRIES = 5000;

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target?: string;
  success: boolean;
  details?: Record<string, unknown>;
}

/**
 * Append-only audit log for admin mutations. Never pass raw secrets/passwords in `details` --
 * callers are responsible for that; this module doesn't attempt to redact after the fact.
 */
export async function logAudit(entry: Omit<AuditEntry, "id" | "timestamp">): Promise<void> {
  const full: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await updateCollection<AuditEntry[]>(COLLECTION, [], (current) => {
    const next = [full, ...current];
    return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
  });
}

export function getAuditLog(limit = 200): AuditEntry[] {
  return readCollection<AuditEntry[]>(COLLECTION, []).slice(0, limit);
}
