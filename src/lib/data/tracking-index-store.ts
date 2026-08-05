import "server-only";
import { updateCollection, readCollection } from "@/lib/store/json-store";

/**
 * Hot-path dedup index for open/click tracking (Stage 5, Part C/D) -- one row per tracking token.
 * A pixel/click hit needs an instant "have we seen this token open/click before?" answer to decide
 * `isUnique`; scanning the full analytics-events log on every hit would be wasteful and slow.
 * This collection is small (one row per send, not per hit) and is the only thing consulted on the
 * hot path -- the detailed per-hit history still goes to analytics-events-store.ts.
 */

const COLLECTION = "tracking-index";

export interface TrackingIndexEntry {
  token: string;
  totalOpens: number;
  uniqueOpenAt: string | null;
  suspectedBotOpens: number;
  totalClicks: number;
  uniqueClickAt: string | null;
  suspectedBotClicks: number;
  lastOpenAt: string | null;
  lastClickAt: string | null;
}

function emptyEntry(token: string): TrackingIndexEntry {
  return {
    token,
    totalOpens: 0,
    uniqueOpenAt: null,
    suspectedBotOpens: 0,
    totalClicks: 0,
    uniqueClickAt: null,
    suspectedBotClicks: 0,
    lastOpenAt: null,
    lastClickAt: null,
  };
}

async function withEntries<T>(mutate: (entries: Record<string, TrackingIndexEntry>) => T): Promise<T> {
  let result!: T;
  await updateCollection<Record<string, TrackingIndexEntry>>(COLLECTION, {}, (current) => {
    const next = { ...current };
    result = mutate(next);
    return next;
  });
  return result;
}

export async function recordOpenHit(token: string, opts: { isBot: boolean; at: string }): Promise<{ isFirstOpen: boolean }> {
  return withEntries((entries) => {
    const entry = entries[token] ?? emptyEntry(token);
    const isFirstOpen = entry.uniqueOpenAt === null && !opts.isBot;
    entries[token] = {
      ...entry,
      totalOpens: entry.totalOpens + 1,
      uniqueOpenAt: isFirstOpen ? opts.at : entry.uniqueOpenAt,
      suspectedBotOpens: entry.suspectedBotOpens + (opts.isBot ? 1 : 0),
      lastOpenAt: opts.at,
    };
    return { isFirstOpen };
  });
}

export async function recordClickHit(token: string, opts: { isBot: boolean; at: string }): Promise<{ isFirstClick: boolean }> {
  return withEntries((entries) => {
    const entry = entries[token] ?? emptyEntry(token);
    const isFirstClick = entry.uniqueClickAt === null && !opts.isBot;
    entries[token] = {
      ...entry,
      totalClicks: entry.totalClicks + 1,
      uniqueClickAt: isFirstClick ? opts.at : entry.uniqueClickAt,
      suspectedBotClicks: entry.suspectedBotClicks + (opts.isBot ? 1 : 0),
      lastClickAt: opts.at,
    };
    return { isFirstClick };
  });
}

export function getTrackingIndexEntry(token: string): TrackingIndexEntry | undefined {
  return readCollection<Record<string, TrackingIndexEntry>>(COLLECTION, {})[token];
}
