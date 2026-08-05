import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type IconBadgeTone = "default" | "accent" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<IconBadgeTone, string> = {
  default: "bg-panel text-text-secondary",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

const SIZE_CLASSES = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-9 w-9" };
const ICON_SIZE_CLASSES = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-4 w-4" };

/**
 * Small tinted rounded-square icon container -- the recurring "icon badge" treatment used next
 * to card/section titles and inside metric cards throughout the app. Centralized here so every
 * usage shares the exact same size and tone scale instead of one-off inline classes.
 */
export function IconBadge({
  icon: Icon,
  tone = "default",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: IconBadgeTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg", SIZE_CLASSES[size], TONE_CLASSES[tone], className)}>
      <Icon className={ICON_SIZE_CLASSES[size]} />
    </div>
  );
}
