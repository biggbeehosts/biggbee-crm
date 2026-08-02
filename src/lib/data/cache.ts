import "server-only";
import { CACHE_TTL_MS } from "./config";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory TTL cache for sheet reads. Scoped to a single server process -- fine for the
 * dev server and single-instance deployments; a multi-instance deployment would want a shared
 * cache (e.g. Redis) instead, but the interface here would not need to change.
 */
const store = new Map<string, CacheEntry<unknown>>();
const lastSyncAt = new Map<string, number>();

export async function getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = CACHE_TTL_MS): Promise<T> {
  const cached = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await fetcher();
  store.set(key, { value, expiresAt: now + ttlMs });
  lastSyncAt.set(key, now);
  return value;
}

export function invalidateCache(key?: string) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}

export function getLastSyncAt(key: string): number | null {
  return lastSyncAt.get(key) ?? null;
}
