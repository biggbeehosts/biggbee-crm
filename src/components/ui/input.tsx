import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-tertiary/70 outline-none transition-all focus:border-accent/60 focus:ring-[3px] focus:ring-accent/25 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/70 outline-none transition-all focus:border-accent/60 focus:ring-[3px] focus:ring-accent/25 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-text-secondary", className)} {...props} />;
}
