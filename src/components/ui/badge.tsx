import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border", {
  variants: {
    variant: {
      default: "bg-panel text-text-secondary border-border-subtle",
      accent: "bg-accent-soft text-accent-strong border-accent/20",
      success: "bg-success/10 text-success border-success/20",
      /** Reserved for genuinely "live" states -- a running job, a healthy/connected integration --
       *  distinct from `success` (a completed/positive outcome that isn't necessarily happening
       *  right now). See globals.css's --accent-lime doc comment. */
      lime: "bg-accent-lime-soft text-accent-lime border-accent-lime/25",
      warning: "bg-warning-soft text-warning border-warning/20",
      danger: "bg-danger/10 text-danger border-danger/20",
      purple: "bg-category-purple/10 text-category-purple border-category-purple/20",
      /** Blue, deliberately supporting/informational only -- never the default or primary
       *  action color (that's `accent`, which is lime). Use for neutral metadata, not for
       *  anything the operator should treat as a live/actionable/primary signal. */
      info: "bg-info-soft text-info-strong border-info/20",
      /** Semantic page-identity accents only (Workflows, Knowledge Base) -- see globals.css's
       *  --category-orange/--category-teal doc comment. */
      orange: "bg-category-orange-soft text-category-orange border-category-orange/20",
      teal: "bg-category-teal-soft text-category-teal border-category-teal/20",
      outline: "bg-transparent text-text-secondary border-border-strong",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dotClassName?: string;
}

export function Badge({ className, variant, dotClassName, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dotClassName && <span className={cn("h-1.5 w-1.5 rounded-full", dotClassName)} />}
      {children}
    </span>
  );
}
