import { cn } from "@/lib/utils/cn";

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-sm font-bold text-white shadow-lg shadow-accent/30">
        B
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-text-primary">Biggbee AI</p>
          <p className="truncate text-[11px] text-text-tertiary">Outreach CRM</p>
        </div>
      )}
    </div>
  );
}
