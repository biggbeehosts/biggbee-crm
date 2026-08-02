import { cn } from "@/lib/utils/cn";

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel", className)}>
      <div className={cn("h-full rounded-full bg-accent transition-all", barClassName)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
