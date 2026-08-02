"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LifeBuoy } from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav-config";
import { Logo } from "./logo";
import { StatusIndicator } from "./status-indicator";
import { useUIState } from "./ui-state-provider";
import { cn } from "@/lib/utils/cn";
import { initials } from "@/lib/utils/format";

export function Sidebar({ connected, mode }: { connected: boolean; mode: "mock" | "google-sheets" }) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIState();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border-subtle bg-surface transition-[width] duration-200 lg:flex",
        sidebarCollapsed ? "w-[76px]" : "w-64"
      )}
    >
      <div className="flex h-16 items-center border-b border-border-subtle px-4">
        <Logo collapsed={sidebarCollapsed} />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            {!sidebarCollapsed && <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{group}</p>}
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active ? "bg-accent-soft text-accent-strong" : "text-text-secondary hover:bg-panel hover:text-text-primary",
                      sidebarCollapsed && "justify-center px-0"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent-strong" : "text-text-tertiary group-hover:text-text-primary")} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-border-subtle p-3">
        <StatusIndicator connected={connected} mode={mode} collapsed={sidebarCollapsed} />

        <div className={cn("flex items-center gap-2.5 rounded-lg px-1.5 py-1.5", !sidebarCollapsed && "hover:bg-panel")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
            {initials("Biggbee Team")}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium text-text-primary">Biggbee Team</p>
              <p className="truncate text-[11px] text-text-tertiary">office@biggbees.com</p>
            </div>
          )}
          {!sidebarCollapsed && <LifeBuoy className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
        </div>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:bg-panel hover:text-text-primary"
        >
          {sidebarCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
          {!sidebarCollapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
