import "server-only";
import type { AnalyticsEvent, AnalyticsEventType } from "@/types";
import { listCollectionKeys, readCollection, updateCollection } from "@/lib/store/json-store";

/**
 * Canonical analytics event log (Stage 5, Part A/L). Sharded by calendar month
 * (`analytics-events-2026-08`, etc.) rather than one ever-growing collection like `audit-log` --
 * audit-log's single-file, 5000-entry-hard-cap pattern is the wrong precedent for tracking-hit
 * volume (opens/clicks can run to thousands/month even at this CRM's modest sending scale); a
 * monthly shard means a dashboard query for "last 30 days" never has to load more than 1-2 files,
 * and nothing is ever silently dropped the way audit-log's cap does.
 *
 * This is the *detailed* event log -- for hot-path unique-open/unique-click dedup, see
 * tracking-index-store.ts, which is checked instead of scanning events on every pixel/click hit.
 */

function shardKey(iso: string): string {
  const d = new Date(iso);
  const year = Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear();
  const month = Number.isNaN(d.getTime()) ? new Date().getUTCMonth() : d.getUTCMonth();
  return `analytics-events-${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Every month-shard key between `from` and `to` (inclusive), so a range query knows exactly
 *  which files to read without guessing or loading everything. */
function shardKeysInRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor <= end) {
    keys.push(`analytics-events-${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

export async function recordEvent(event: Omit<AnalyticsEvent, "id" | "createdAt">): Promise<AnalyticsEvent> {
  const full: AnalyticsEvent = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  };
  const key = shardKey(full.timestamp);
  await updateCollection<AnalyticsEvent[]>(key, [], (current) => [full, ...current]);
  return full;
}

export interface EventFilter {
  from?: string;
  to?: string;
  campaignId?: string;
  leadId?: string;
  type?: AnalyticsEventType;
  types?: AnalyticsEventType[];
  /** Test events are excluded by default (see markEventsAsTest) -- pass true to include them,
   *  e.g. for the admin "inspect failed tracking events" view. */
  includeTest?: boolean;
}

/** Reads only the month-shards the [from, to] range touches, then filters/sorts in memory --
 *  matches the rest of this CRM's "load what's relevant, reduce in JS" scale (see
 *  dashboard-metrics.ts); no pagination infra needed at this data volume. */
export async function getEvents(filter: EventFilter = {}): Promise<AnalyticsEvent[]> {
  const to = filter.to ? new Date(filter.to) : new Date();
  const from = filter.from ? new Date(filter.from) : new Date(to.getFullYear(), to.getMonth() - 2, 1);
  const shards = shardKeysInRange(from, to);

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const types = filter.types ?? (filter.type ? [filter.type] : null);

  const results: AnalyticsEvent[] = [];
  for (const shard of shards) {
    const events = readCollection<AnalyticsEvent[]>(shard, []);
    for (const e of events) {
      const ts = new Date(e.timestamp).getTime();
      if (Number.isFinite(ts) && (ts < fromMs || ts > toMs)) continue;
      if (types && !types.includes(e.type)) continue;
      if (filter.campaignId && e.campaignId !== filter.campaignId) continue;
      if (filter.leadId && e.leadId !== filter.leadId) continue;
      if (!filter.includeTest && e.isTestEvent) continue;
      results.push(e);
    }
  }
  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Part N: "mark events as test" / "delete test events" -- both need the shard key to mutate the
 *  right file(s), so they take an explicit month hint (the admin UI has the event's timestamp
 *  already) rather than scanning every shard ever written. */
export async function markEventsAsTest(ids: string[], monthHint: string): Promise<number> {
  let changed = 0;
  await updateCollection<AnalyticsEvent[]>(monthHint, [], (current) =>
    current.map((e) => {
      if (ids.includes(e.id) && !e.isTestEvent) changed++;
      return ids.includes(e.id) ? { ...e, isTestEvent: true } : e;
    })
  );
  return changed;
}

export async function deleteTestEvents(monthHint: string): Promise<number> {
  let removed = 0;
  await updateCollection<AnalyticsEvent[]>(monthHint, [], (current) => {
    const kept = current.filter((e) => !e.isTestEvent);
    removed = current.length - kept.length;
    return kept;
  });
  return removed;
}

export function shardKeyForTimestamp(iso: string): string {
  return shardKey(iso);
}

/** Part K/N retention purge -- deletes events older than `retentionDays` across every shard that
 *  exists on disk (via listCollectionKeys, not a guessed range), admin-triggered only. */
export async function purgeEventsOlderThan(retentionDays: number): Promise<number> {
  const cutoffMs = Date.now() - retentionDays * 86_400_000;
  const shards = listCollectionKeys("analytics-events-");
  let removed = 0;
  for (const shard of shards) {
    await updateCollection<AnalyticsEvent[]>(shard, [], (current) => {
      const kept = current.filter((e) => {
        const ts = new Date(e.timestamp).getTime();
        return !Number.isFinite(ts) || ts >= cutoffMs;
      });
      removed += current.length - kept.length;
      return kept;
    });
  }
  return removed;
}
