/**
 * Sheet dates arrive as ISO strings, "YYYY-MM-DD", locale strings, or empty cells.
 * Every helper here is defensive -- malformed input returns null/fallback instead of throwing,
 * because a single bad cell must never crash the dashboard.
 */

export function safeParseDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const str = String(input).trim();
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(input: unknown, opts?: Intl.DateTimeFormatOptions): string {
  const d = safeParseDate(input);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(input: unknown): string {
  const d = safeParseDate(input);
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysSince(input: unknown): number | null {
  const d = safeParseDate(input);
  if (!d) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.floor(diffMs / 86_400_000);
}

export function formatRelativeTime(input: unknown): string {
  const days = daysSince(input);
  if (days === null) return "—";
  if (days < 0) return "in the future";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function toIsoDateKey(input: unknown): string | null {
  const d = safeParseDate(input);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Sort helper: empty/invalid dates always sort to the end regardless of direction. */
export function compareDatesEmptyLast(a: unknown, b: unknown): number {
  const da = safeParseDate(a);
  const db = safeParseDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da.getTime() - db.getTime();
}
