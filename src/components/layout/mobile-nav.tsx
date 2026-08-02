"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav-config";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Logo } from "./logo";
import { StatusIndicator } from "./status-indicator";
import { useUIState } from "./ui-state-provider";
import { cn } from "@/lib/utils/cn";
import * as DialogPrimitive from "@radix-ui/react-dialog";

export function MobileNav({ connected, mode }: { connected: boolean; mode: "mock" | "google-sheets" }) {
  const pathname = usePathname();
  const { mobileNavOpen, setMobileNavOpen } = useUIState();

  return (
    <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <DrawerContent side="left" widthClassName="w-72" className="flex flex-col p-0">
        <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
        <div className="flex h-16 items-center border-b border-border-subtle px-4">
          <Logo />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{group}</p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-accent-soft text-accent-strong" : "text-text-secondary hover:bg-panel hover:text-text-primary"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent-strong" : "text-text-tertiary")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border-subtle p-3">
          <StatusIndicator connected={connected} mode={mode} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
