import { PlugZap } from "lucide-react";

export function PlaceholderChart({ reason }: { reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-panel text-text-tertiary">
        <PlugZap className="h-4 w-4" />
      </div>
      <p className="text-xs font-medium text-text-secondary">Tracking not connected</p>
      <p className="max-w-[220px] text-[11px] text-text-tertiary">{reason}</p>
    </div>
  );
}
