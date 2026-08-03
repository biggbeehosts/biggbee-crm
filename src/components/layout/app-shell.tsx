"use client";

import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { Header } from "./header";
import { useUIState } from "./ui-state-provider";
import { cn } from "@/lib/utils/cn";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";

export function AppShell({
  children,
  connected,
  mode,
  attentionCount,
  adminEmail,
}: {
  children: React.ReactNode;
  connected: boolean;
  mode: "mock" | "google-sheets";
  attentionCount: number;
  adminEmail: string;
}) {
  const { sidebarCollapsed } = useUIState();

  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
        <Sidebar connected={connected} mode={mode} />
        <MobileNav connected={connected} mode={mode} />
        <div className={cn("flex min-h-screen flex-col transition-[margin] duration-200", sidebarCollapsed ? "lg:ml-[76px]" : "lg:ml-64")}>
          <Header attentionCount={attentionCount} adminEmail={adminEmail} />
          <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
