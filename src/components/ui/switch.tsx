"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils/cn";

export function Switch({ className, ...props }: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border-subtle bg-surface-raised transition-colors data-[state=checked]:bg-accent data-[state=checked]:border-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-1 rounded-full bg-text-secondary transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  );
}
