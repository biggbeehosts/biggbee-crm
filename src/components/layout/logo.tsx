import Image from "next/image";
import { cn } from "@/lib/utils/cn";

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/branding/biggbee-mark.png"
        alt="Biggbee AI"
        width={897}
        height={855}
        className="h-8 w-8 shrink-0 object-contain"
      />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-text-primary">
            Biggbee <span className="text-accent">AI</span>
          </p>
          <p className="truncate text-[11px] text-text-tertiary">Operations Center</p>
        </div>
      )}
    </div>
  );
}
