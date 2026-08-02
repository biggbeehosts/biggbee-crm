import type { LeadStatus } from "@/types";
import { STATUS_COLORS } from "@/lib/utils/status";
import { CONFIDENCE_BAND_COLORS, confidenceBand, confidenceLabel } from "@/lib/utils/confidence";
import { cn } from "@/lib/utils/cn";

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const colors = STATUS_COLORS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium", colors.bg, colors.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
      {status}
    </span>
  );
}

export function ConfidenceBadge({ value, className }: { value: number | null | undefined; className?: string }) {
  const band = confidenceBand(value);
  const colors = CONFIDENCE_BAND_COLORS[band];
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", colors.bg, colors.text, className)}>
      {confidenceLabel(value)}
    </span>
  );
}
