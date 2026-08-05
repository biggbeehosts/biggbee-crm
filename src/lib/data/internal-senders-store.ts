import "server-only";
import { readCollection, updateCollection } from "@/lib/store/json-store";

/**
 * Admin-managed internal-sender allowlist (Stage 5, Part N) -- backs isInternalSender() in
 * src/lib/utils/internal-senders.ts. Previously env-var-only (INTERNAL_SENDER_ALLOWLIST), which
 * meant "manage the allowlist" required an env edit + redeploy; this store makes it a real admin
 * action. The env var is only ever consulted as the seed value the very first time this
 * collection is read/written -- once the file exists (even as an admin-emptied array), it is the
 * whole truth from then on, never silently re-merged with the env default.
 */

const COLLECTION = "internal-senders-allowlist";

function envDefaults(): string[] {
  const raw = process.env.INTERNAL_SENDER_ALLOWLIST ?? "office@biggbees.com";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowlistEntries(): string[] {
  return readCollection<string[]>(COLLECTION, envDefaults());
}

export async function addAllowlistEntry(entry: string): Promise<string[]> {
  const normalized = entry.trim().toLowerCase();
  if (!normalized) return getAllowlistEntries();
  return updateCollection<string[]>(COLLECTION, envDefaults(), (current) => (current.includes(normalized) ? current : [...current, normalized]));
}

export async function removeAllowlistEntry(entry: string): Promise<string[]> {
  const normalized = entry.trim().toLowerCase();
  return updateCollection<string[]>(COLLECTION, envDefaults(), (current) => current.filter((e) => e !== normalized));
}
