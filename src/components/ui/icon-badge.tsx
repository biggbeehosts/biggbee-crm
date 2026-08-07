import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type IconBadgeTone = "default" | "accent" | "success" | "lime" | "warning" | "danger" | "purple" | "info" | "orange" | "teal";

const TONE_CLASSES: Record<IconBadgeTone, string> = {
  default: "bg-panel text-text-secondary",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success/10 text-success",
  /** Reserved for genuinely "live" states -- see globals.css's --accent-lime doc comment. */
  lime: "bg-accent-lime-soft text-accent-lime",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger/10 text-danger",
  purple: "bg-category-purple/10 text-category-purple",
  /** Blue, supporting/informational only -- see Badge's "info" variant doc comment. */
  info: "bg-info-soft text-info-strong",
  /** Semantic page-identity accents only (Workflows, Knowledge Base) -- see globals.css's
   *  --category-orange/--category-teal doc comment. */
  orange: "bg-category-orange-soft text-category-orange",
  teal: "bg-category-teal-soft text-category-teal",
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
