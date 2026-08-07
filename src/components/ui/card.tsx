import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** The three-tier surface system: 1 = main module card (the default -- a Card on its own on a
 *  page), 2 = metric/stat card (slightly more raised, used inside a grid of many), 3 = nested
 *  panel/control strip living inside another card. Each level is a deliberate step lighter than
 *  the one below it so nesting reads as real depth. */
type CardLevel = 1 | 2 | 3;

const LEVEL_BG: Record<CardLevel, string> = {
  1: "bg-surface",
  2: "bg-surface-2",
  3: "bg-surface-raised",
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: CardLevel;
  /** A visibly "live/highlighted" card -- a running workflow, the selected campaign. Sparing use
   *  only; most cards should stay in the default, quieter treatment. */
  glow?: boolean;
}

export function Card({ className, level = 1, glow, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border [background-image:var(--card-gradient)] [box-shadow:var(--shadow-card)] transition-colors",
        LEVEL_BG[level],
        glow ? "border-accent/30 glow-accent" : "border-border-subtle",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 p-4 pb-2.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-text-primary", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-text-tertiary mt-0.5", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-5 pt-3 border-t border-border-subtle", className)} {...props} />;
}
