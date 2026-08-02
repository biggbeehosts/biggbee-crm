/** Returns the first non-empty string among the candidates, else the fallback. */
export function coalesceString(fallback: string, ...candidates: Array<unknown>): string {
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return fallback;
}

const TRUE_VALUES = new Set(["yes", "true", "1", "y", "on", "attached", "sent", "booked"]);
const FALSE_VALUES = new Set(["no", "false", "0", "n", "off", "", "not attached", "not sent"]);

/** Normalizes the many ways a spreadsheet can spell a boolean ("Yes"/"No", TRUE/FALSE, 1/0, blank). */
export function parseYesNo(input: unknown, defaultValue = false): boolean {
  if (typeof input === "boolean") return input;
  if (input === null || input === undefined) return defaultValue;
  const s = String(input).trim().toLowerCase();
  if (!s) return defaultValue;
  if (TRUE_VALUES.has(s)) return true;
  if (FALSE_VALUES.has(s)) return false;
  return defaultValue;
}

export function parseNumber(input: unknown, fallback: number | null = null): number | null {
  if (typeof input === "number") return isNaN(input) ? fallback : input;
  if (input === null || input === undefined || input === "") return fallback;
  const cleaned = String(input).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return fallback;
  const n = Number(cleaned);
  return isNaN(n) ? fallback : n;
}

export function parseStringList(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof input !== "string") return [];
  return input
    .split(/[;\n|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function safeTrim(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input).trim();
}

export function isEmptyValue(input: unknown): boolean {
  return input === null || input === undefined || String(input).trim() === "";
}
