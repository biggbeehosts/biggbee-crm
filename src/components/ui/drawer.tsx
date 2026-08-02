"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export function DrawerContent({
  className,
  children,
  side = "right",
  widthClassName = "w-full sm:max-w-xl",
  ...props
}: DialogPrimitive.DialogContentProps & { side?: "right" | "left"; widthClassName?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-0 z-50 h-full overflow-y-auto border-border-strong bg-surface-raised shadow-2xl shadow-black/40 focus:outline-none",
          side === "right"
            ? "right-0 border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
            : "left-0 border-r data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          widthClassName,
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DrawerHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-raised p-5", className)} {...props}>
      <div className="min-w-0 flex-1">{children}</div>
      <DialogPrimitive.Close className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-panel hover:text-text-primary">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </div>
  );
}

export function DrawerTitle({ className, ...props }: DialogPrimitive.DialogTitleProps) {
  return <DialogPrimitive.Title className={cn("text-base font-semibold text-text-primary", className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: DialogPrimitive.DialogDescriptionProps) {
  return <DialogPrimitive.Description className={cn("text-sm text-text-tertiary mt-0.5", className)} {...props} />;
}

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
