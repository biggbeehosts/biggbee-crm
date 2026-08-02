"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: TooltipPrimitive.TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-xs text-text-primary shadow-lg data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
