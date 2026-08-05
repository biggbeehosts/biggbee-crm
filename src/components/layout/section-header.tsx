import type { LucideIcon } from "lucide-react";
import { IconBadge, type IconBadgeTone } from "@/components/ui/icon-badge";
import { cn } from "@/lib/utils/cn";

/**
 * Groups a cluster of cards under a labeled section (e.g. a row of charts, or an activity
 * region) -- icon + title on the left, optional status pills/actions on the right. Distinct
 * from PageHeader, which is the one title at the top of a whole page.
 */
export function SectionHeader({
  icon,
  tone = "default",
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon;
  tone?: IconBadgeTone;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2.5">
        {icon && <IconBadge icon={icon} tone={tone} size="sm" />}
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && <p className="text-xs text-text-tertiary">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
