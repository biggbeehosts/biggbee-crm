import type { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { IconBadge } from "./icon-badge";
import { cn } from "@/lib/utils/cn";

/** Compact, muted replacement for a metric a provider can't confirm yet -- never a huge line of
 *  text standing where a number should be. Structurally similar to StatCard (same grid slot) but
 *  visually says "nothing to show here" at a glance instead of demanding to be read. */
export function UnavailableStatCard({
  label,
  reason = "Provider not connected",
  icon: Icon,
  cta,
  className,
}: {
  label: string;
  reason?: string;
  icon?: LucideIcon;
  cta?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card level={2} className={cn("flex flex-col justify-between p-4", className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-text-tertiary">{label}</p>
        {Icon && <IconBadge icon={Icon} tone="default" size="sm" />}
      </div>
      <div className="mt-2">
        <p className="text-sm font-medium text-text-tertiary/80">{reason}</p>
        {cta && <div className="mt-1.5">{cta}</div>}
      </div>
    </Card>
  );
}
