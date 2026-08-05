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

export function StatCard({ label, value, icon: Icon, hint, trend, tone = "default", className }: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-text-tertiary">{label}</p>
        {Icon && <IconBadge icon={Icon} tone={tone} />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
      {(hint || trend) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {trend && (
            <span className={cn("text-xs font-medium", trend.positive ? "text-success" : "text-danger")}>
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
