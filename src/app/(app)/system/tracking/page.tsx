import { Radar } from "lucide-react";
import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getEvents } from "@/lib/data/analytics-events-store";
import { getTrackingSettings } from "@/lib/data/tracking-settings-store";
import { getInternalSenderAllowlist } from "@/lib/utils/internal-senders";
import { getAuditLog } from "@/lib/audit/log";
import { PageHeader } from "@/components/layout/page-header";
import { TrackingAdminView } from "@/components/system/tracking-admin-view";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

const RECENT_FROM = new Date(Date.now() - 30 * 86_400_000).toISOString();

export default async function TrackingAdminPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const [leads, campaigns, recentEvents, auditLog] = await Promise.all([
    getLeads(workspaceId),
    getCampaigns(workspaceId),
    getEvents({ from: RECENT_FROM, includeTest: true }),
    Promise.resolve(getAuditLog(500)),
  ]);

  const settings = getTrackingSettings();
  const allowlist = getInternalSenderAllowlist();
  const suppressedLeads = leads.filter((l) => l.suppressedReason);
  const trackingAuditLog = auditLog.filter((a) => a.action.startsWith("analytics.") || a.action.startsWith("deliverability."));

  return (
    <div>
      <PageHeader
        title="Tracking"
        subtitle="Per-campaign tracking toggles, internal-sender allowlist, suppression, and tracking health -- Stage 5 admin controls"
        icon={Radar}
        tone="info"
      />
      <TrackingAdminView
        campaigns={campaigns}
        recentEvents={recentEvents}
        settings={settings}
        allowlist={allowlist}
        suppressedLeads={suppressedLeads}
        auditLog={trackingAuditLog}
      />
    </div>
  );
}
