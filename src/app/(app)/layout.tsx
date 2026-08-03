import { AppShell } from "@/components/layout/app-shell";
import { getConnectionStatus, getLeads } from "@/lib/data/repository";
import { buildNeedsAttention } from "@/lib/calculations/activity";
import { getCurrentSession } from "@/lib/auth/current-session";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, leads, session] = await Promise.all([getConnectionStatus(), getLeads(), getCurrentSession()]);
  const attentionCount = buildNeedsAttention(leads).length;

  return (
    <AppShell connected={status.connected} mode={status.mode} attentionCount={attentionCount} adminEmail={session?.email ?? ""}>
      {children}
    </AppShell>
  );
}
