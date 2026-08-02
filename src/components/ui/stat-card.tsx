import type { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  trend?: { value: number; positive?: boolean };
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  className?: string;
}

const TONE_ICON: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-panel text-text-secondary",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function StatCard({ label, value, icon: Icon, hint, trend, tone = "default", className }: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-text-tertiary">{label}</p>
        {Icon && (
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", TONE_ICON[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
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
