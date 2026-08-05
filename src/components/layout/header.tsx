"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, Menu, RefreshCw, Search, Settings as SettingsIcon, LogOut, Moon, Sun } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-config";
import { useUIState } from "./ui-state-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils/format";
import { refreshDataAction } from "@/lib/actions/leads";
import { logoutAction } from "@/lib/auth/actions";

export function Header({ attentionCount = 0, adminEmail = "" }: { attentionCount?: number; adminEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, setMobileNavOpen } = useUIState();
  const [refreshing, setRefreshing] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [search, setSearch] = React.useState("");

  async function handleLogout() {
    setLoggingOut(true);
    await logoutAction();
  }

  const current = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  async function handleRefresh() {
    setRefreshing(true);
    await refreshDataAction();
    router.refresh();
    setTimeout(() => setRefreshing(false), 500);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    router.push(`/leads?search=${encodeURIComponent(search.trim())}`);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface/80 px-4 backdrop-blur-md lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="hidden min-w-0 flex-col justify-center lg:flex">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Link href="/dashboard" className="hover:text-text-primary">
            Biggbee CRM
          </Link>
          {current && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-text-secondary">{current.label}</span>
            </>
          )}
        </div>
        <h1 className="truncate text-sm font-semibold text-text-primary">{current?.label ?? "Dashboard"}</h1>
      </div>

      <form onSubmit={handleSearchSubmit} className="ml-auto flex flex-1 items-center gap-2 lg:max-w-sm">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads, companies, emails…"
            className="h-9 pl-8"
          />
        </div>
      </form>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh data" aria-label="Refresh data">
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" title="Needs attention" aria-label={`Needs attention${attentionCount > 0 ? ` (${attentionCount})` : ""}`}>
              <Bell className="h-4 w-4" />
              {attentionCount > 0 && (
                <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                  {attentionCount > 9 ? "9+" : attentionCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Needs attention</DropdownMenuLabel>
            <div className="px-2.5 pb-2 text-xs text-text-tertiary">
              {attentionCount > 0
                ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} across failed sends, low-confidence leads and missing data.`
                : "You're all caught up."}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard#needs-attention">Open Dashboard</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong" aria-label="Account menu">
              {initials(adminEmail || "Admin")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Admin</DropdownMenuLabel>
            <div className="px-2.5 pb-2 text-xs text-text-tertiary">{adminEmail}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SettingsIcon className="h-4 w-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleLogout} disabled={loggingOut}>
              <LogOut className="h-4 w-4" /> {loggingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
