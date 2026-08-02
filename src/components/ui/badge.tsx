import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border", {
  variants: {
    variant: {
      default: "bg-panel text-text-secondary border-border-subtle",
      accent: "bg-accent-soft text-accent-strong border-accent/20",
      success: "bg-success/10 text-success border-success/20",
      warning: "bg-warning/10 text-warning border-warning/20",
      danger: "bg-danger/10 text-danger border-danger/20",
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
