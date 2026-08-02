export type ConfidenceBand = "high" | "medium" | "low" | "unknown";

export function confidenceBand(value: number | null | undefined): ConfidenceBand {
  if (value === null || value === undefined || isNaN(value)) return "unknown";
  if (value >= 75) return "high";
  if (value >= 45) return "medium";
  return "low";
}

export const CONFIDENCE_BAND_COLORS: Record<ConfidenceBand, { bg: string; text: string; bar: string }> = {
  high: { bg: "bg-emerald-500/15", text: "text-emerald-300", bar: "bg-emerald-400" },
  medium: { bg: "bg-amber-500/15", text: "text-amber-300", bar: "bg-amber-400" },
  low: { bg: "bg-rose-500/15", text: "text-rose-300", bar: "bg-rose-400" },
  unknown: { bg: "bg-zinc-500/15", text: "text-zinc-400", bar: "bg-zinc-500" },
};

export function confidenceLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "Unscored";
  return `${Math.round(value)}%`;
}
