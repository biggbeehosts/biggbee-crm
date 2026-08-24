import { AppShell } from "@/components/layout/app-shell";
import { getConnectionStatus, getLeads } from "@/lib/data/repository";
import { buildNeedsAttention } from "@/lib/calculations/activity";
import { getCurrentSession } from "@/lib/auth/current-session";
import { DEFAULT_WORKSPACE_ID } from "@/types";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Phase A: every page runs as the default (Biggbee) workspace until Phase B introduces a real
  // session-resolved activeWorkspaceId -- see types/workspace.ts.
  const [status, leads, session] = await Promise.all([getConnectionStatus(), getLeads(DEFAULT_WORKSPACE_ID), getCurrentSession()]);
  const attentionCount = buildNeedsAttention(leads).length;

  return (
    <AppShell connected={status.connected} mode={status.mode} attentionCount={attentionCount} adminEmail={session?.email ?? ""}>
      {children}
    </AppShell>
  );
}
