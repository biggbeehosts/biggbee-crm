export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function percentageOf(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Sorts a list of strings/numbers, always placing "—", empty, or nullish values last. */
export function sortEmptyLast<T>(
  items: T[],
  getValue: (item: T) => string | number | null | undefined,
  direction: "asc" | "desc" = "asc"
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    const aEmpty = va === null || va === undefined || va === "";
    const bEmpty = vb === null || vb === undefined || vb === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (va! < vb!) return -1 * factor;
    if (va! > vb!) return 1 * factor;
    return 0;
  });
}
