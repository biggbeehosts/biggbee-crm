import { cn } from "@/lib/utils/cn";

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-sm font-bold text-accent-foreground shadow-lg shadow-accent/30">
        B
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-text-primary">
            Biggbee <span className="text-accent">AI</span>
          </p>
          <p className="truncate text-[11px] text-text-tertiary">Operations Center</p>
        </div>
      )}
    </div>
  );
}
