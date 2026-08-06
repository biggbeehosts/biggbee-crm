import type { ErrorRecord } from "@/types";
import { isInternalSender } from "@/lib/utils/internal-senders";
import { safeParseDate } from "@/lib/utils/date";
import { severityOf } from "./error-severity";

/** How far back an error can be and still count as "current" on the dashboard. Anything older
 *  stays fully visible on the Errors page -- this window only controls the dashboard's summary,
 *  never what the operational log retains. */
const RECENT_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface DashboardErrorSummary {
  /** Deduplicated, recent, non-internal errors -- newest first. What the dashboard should show. */
  active: ErrorRecord[];
  /** Errors that exist in the sheet but were excluded from `active` (internal test lead, outside
   *  the recency window, or a repeat of one already shown) -- purely for a "N more in Errors" hint,
   *  never used to compute a count that implies something is unresolved. */
  hiddenCount: number;
  /** True when at least one *critical* (non-validation) error is in the active set -- drives
   *  whether the dashboard shows an alert state at all versus a quiet "all clear". */
  hasCritical: boolean;
}

/** Filters the raw Errors sheet down to what's actually worth surfacing on the dashboard: recent,
 *  not from an internal/test sender, and collapsed so a repeated failure shows once (with its most
 *  recent occurrence) instead of flooding the panel. The Errors page still shows the unfiltered
 *  full history -- this never deletes or mutates anything, it's a read-time view. */
export function summarizeDashboardErrors(errors: ErrorRecord[], now: number = Date.now()): DashboardErrorSummary {
  const sorted = [...errors].sort((a, b) => (safeParseDate(b.timestamp)?.getTime() ?? 0) - (safeParseDate(a.timestamp)?.getTime() ?? 0));

  const active: ErrorRecord[] = [];
  const seenSignatures = new Set<string>();
  let hiddenCount = 0;

  for (const err of sorted) {
    if (err.leadEmail && isInternalSender(err.leadEmail)) {
      hiddenCount++;
      continue;
    }
    const ts = safeParseDate(err.timestamp)?.getTime();
    if (ts === undefined || now - ts > RECENT_WINDOW_MS) {
      hiddenCount++;
      continue;
    }
    const signature = `${err.source ?? ""}|${err.nodeName ?? ""}|${err.errorMessage ?? ""}`;
    if (seenSignatures.has(signature)) {
      hiddenCount++;
      continue;
    }
    seenSignatures.add(signature);
    active.push(err);
  }

  return { active, hiddenCount, hasCritical: active.some((e) => severityOf(e) === "critical") };
}

/** Same internal-sender exclusion, applied to any record carrying a `leadEmail` -- used to keep
 *  internal/test-lead noise out of the dashboard's Recent Activity feed the same way it's kept out
 *  of Recent Errors, without touching buildActivityFeed itself (it stays a straight, reusable
 *  "here's everything" builder; filtering the inputs is cheaper than filtering its output). */
export function excludeInternalSenderLeads<T extends { leadEmail?: string }>(records: T[]): T[] {
  return records.filter((r) => !r.leadEmail || !isInternalSender(r.leadEmail));
}
