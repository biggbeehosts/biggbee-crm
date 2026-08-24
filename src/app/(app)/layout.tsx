import { AppShell } from "@/components/layout/app-shell";
import { getConnectionStatus, getLeads } from "@/lib/data/repository";
import { buildNeedsAttention } from "@/lib/calculations/activity";
import { pageWorkspaceContext, getAccessibleWorkspaces } from "@/lib/auth/workspace-context";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Redirects to /login itself if the session, account, or active workspace no longer resolves
  // (e.g. the account was deactivated or its grants changed mid-session) -- every page under this
  // layout can trust that by the time it renders, pageWorkspaceContext() here already succeeded.
  const ctx = await pageWorkspaceContext();
  const [status, leads, workspaces] = await Promise.all([
    getConnectionStatus(),
    getLeads(ctx.workspaceId),
    getAccessibleWorkspaces(ctx.workspaceIds),
  ]);
  const attentionCount = buildNeedsAttention(leads).length;

  return (
    <AppShell
      connected={status.connected}
      mode={status.mode}
      attentionCount={attentionCount}
      adminEmail={ctx.email}
      workspaces={workspaces}
      activeWorkspaceId={ctx.workspaceId}
    >
      {children}
    </AppShell>
  );
}
