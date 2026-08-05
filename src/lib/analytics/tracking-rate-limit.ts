import "server-only";
import { updateCollection, readCollection } from "@/lib/store/json-store";

/**
 * Sliding-window throttle for tracking-pixel/click-redirect *recording* (Stage 5, Part K) -- same
 * updateCollection-based pattern as src/lib/auth/rate-limit.ts, but keyed by token+IP-hash instead
 * of email+IP, and it throttles event-recording only, never the response itself (a pixel must
 * always render, a click must always redirect -- see Part C: "do not block email rendering if
 * tracking fails"). Once throttled, the hit is still served but silently not recorded, which is
 * the correct failure mode for an abuse guard on a public, unauthenticated endpoint.
 */

const COLLECTION = "tracking-rate-limit";
const MAX_HITS = 20;
const WINDOW_MS = 60_000;

type Store = Record<string, number[]>;

export function isTrackingRateLimited(key: string): boolean {
  const store = readCollection<Store>(COLLECTION, {});
  const hits = store[key] ?? [];
  const now = Date.now();
  return hits.filter((t) => now - t < WINDOW_MS).length >= MAX_HITS;
}

export async function recordTrackingHit(key: string): Promise<void> {
  const now = Date.now();
  await updateCollection<Store>(COLLECTION, {}, (store) => {
    const recent = (store[key] ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    return { ...store, [key]: recent };
  });
}
