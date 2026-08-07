import type { LucideIcon } from "lucide-react";
import { IconBadge, type IconBadgeTone } from "@/components/ui/icon-badge";
import { cn } from "@/lib/utils/cn";

/** `icon`/`tone` are optional and additive -- subtle per-area semantic identity (Section 7 of the
 *  polish brief: "small accents in the page title icon", never a full page recolor). Pages that
 *  don't pass them render exactly as before. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  icon,
  tone,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  tone?: IconBadgeTone;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex items-center gap-3">
        {icon && <IconBadge icon={icon} tone={tone ?? "default"} />}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-text-tertiary">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
