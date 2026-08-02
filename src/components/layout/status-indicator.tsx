import { cn } from "@/lib/utils/cn";

export function StatusIndicator({
  connected,
  mode,
  collapsed,
  className,
}: {
  connected: boolean;
  mode: "mock" | "google-sheets";
  collapsed?: boolean;
  className?: string;
}) {
  const label = mode === "mock" ? "Mock data mode" : connected ? "Google Sheets connected" : "Google Sheets error";
  const dotColor = mode === "mock" ? "bg-accent" : connected ? "bg-success" : "bg-danger";

  if (collapsed) {
    return (
      <div className={cn("flex justify-center", className)} title={label}>
        <span className={cn("h-2 w-2 rounded-full", dotColor)} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-border-subtle bg-panel px-2.5 py-2", className)}>
      <span className={cn("relative flex h-2 w-2 shrink-0")}>
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotColor)} />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
      </span>
      <span className="truncate text-[11px] font-medium text-text-secondary">{label}</span>
    </div>
  );
}
