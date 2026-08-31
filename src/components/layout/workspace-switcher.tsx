"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import type { PublicWorkspace } from "@/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { switchWorkspaceAction } from "@/lib/actions/workspace";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Sidebar workspace switcher. An account authorized for exactly one workspace sees a static
 * label -- there is nothing to switch to, so no dropdown affordance is shown (Phase B requirement
 * 3). An account with more than one authorized workspace gets a real switcher; the actual
 * authorization check happens server-side in switchWorkspaceAction, never here.
 */
export function WorkspaceSwitcher({ workspaces, activeWorkspaceId, collapsed }: { workspaces: PublicWorkspace[]; activeWorkspaceId: string; collapsed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [switching, setSwitching] = React.useState<string | null>(null);
  const active = workspaces.find((w) => w.workspaceId === activeWorkspaceId);
  const label = active?.workspaceName ?? activeWorkspaceId;

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;
    setSwitching(workspaceId);
    const result = await switchWorkspaceAction(workspaceId);
    setSwitching(null);
    if (result.success) {
      toast(result.message, "success");
      router.push("/dashboard");
      router.refresh();
    } else {
      toast(result.message, "error");
    }
  }

  if (workspaces.length <= 1) {
    return (
      <div
        title={collapsed ? label : undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border-subtle bg-panel px-2.5 py-1.5 text-xs font-medium text-text-secondary",
          collapsed && "justify-center px-0"
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        {!collapsed && <span className="truncate">{label}</span>}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={collapsed ? label : undefined}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-panel px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary",
            collapsed && "justify-center px-0"
          )}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 text-text-tertiary" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.workspaceId} onSelect={() => handleSwitch(w.workspaceId)} disabled={switching !== null}>
            <span className="flex-1 truncate">{w.workspaceName}</span>
            {w.workspaceId === activeWorkspaceId ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
            ) : switching === w.workspaceId ? (
              <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-full bg-text-tertiary/40" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
