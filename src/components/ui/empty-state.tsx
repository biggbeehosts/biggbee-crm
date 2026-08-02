import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      {Icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-panel text-text-tertiary">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-xs text-text-tertiary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
