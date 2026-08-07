import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-sm shadow-accent/25 hover:bg-accent-strong hover:-translate-y-px hover:shadow-md hover:shadow-accent/30 active:translate-y-0",
        secondary:
          "bg-surface-2 text-text-primary border border-border-subtle hover:border-border-strong hover:bg-surface-raised",
        ghost: "text-text-secondary hover:text-text-primary hover:bg-panel",
        outline: "border border-border-strong text-text-primary hover:bg-panel",
        success: "bg-success/90 text-white shadow-sm shadow-success/20 hover:bg-success",
        destructive: "bg-danger/15 text-danger border border-danger/25 hover:bg-danger/25 hover:border-danger/40",
        link: "text-accent underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9 shrink-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = "Button";
