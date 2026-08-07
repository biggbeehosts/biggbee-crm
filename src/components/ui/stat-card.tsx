import type { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { IconBadge, type IconBadgeTone } from "./icon-badge";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  tone?: IconBadgeTone;
  className?: string;
}

const ACCENT_BAR: Record<string, string> = {
  default: "bg-border-strong",
  accent: "bg-accent",
  success: "bg-success",
  lime: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
  purple: "bg-category-purple",
  info: "bg-info",
};

export function StatCard({ label, value, icon: Icon, hint, trend, tone = "default", className }: StatCardProps) {
  return (
    <Card level={2} className={cn("relative overflow-hidden p-4 pl-5", className)}>
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", ACCENT_BAR[tone])} />
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-text-tertiary">{label}</p>
        {Icon && <IconBadge icon={Icon} tone={tone} size="sm" />}
      </div>
      <p className="mt-2 text-[28px] font-extrabold leading-none tracking-tight text-text-primary">{value}</p>
      {(hint || trend) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {trend && (
            <span className={cn("text-xs font-medium", trend.positive ? "text-accent-lime" : "text-danger")}>
              {trend.positive ? "+" : ""}
              {trend.value}%
            </span>
          )}
          {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
        </div>
      )}
    </Card>
  );
}
