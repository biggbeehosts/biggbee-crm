export const dynamic = "force-dynamic";

import { getConnectionStatus, getErrors, getKnowledgeBase, getLeadMemory, getLeads, isUsingMockData } from "@/lib/data/repository";
import { getCampaignsSync } from "@/lib/data/campaigns-store";
import { getLastSyncAt } from "@/lib/data/cache";
import { computeDashboardMetrics, leadsByCountry, leadsByIndustry, leadsByService, leadsByStatus } from "@/lib/calculations/dashboard-metrics";
import { buildActivityFeed } from "@/lib/calculations/activity";
import { computeCampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { PageHeader } from "@/components/layout/page-header";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { DashboardControls } from "@/components/dashboard/dashboard-controls";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RecentErrors } from "@/components/dashboard/recent-errors";
import { AutomationCard, type ConfiguredActions } from "@/components/dashboard/automation-card";
import { CampaignReadinessCard } from "@/components/dashboard/campaign-readiness-card";
import { ChartCard } from "@/components/charts/chart-card";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { CountPieChart } from "@/components/charts/count-pie-chart";
import { Badge } from "@/components/ui/badge";
import { isActionConfigured } from "@/lib/n8n/config";
import { fetchAutomationStatus } from "@/lib/n8n/client";
import type { AutomationStatusResult } from "@/lib/n8n/types";

async function getInitialAutomationStatus(): Promise<AutomationStatusResult> {
  if (!isActionConfigured("status")) return { configured: false, status: null };
  try {
    return { configured: true, status: await fetchAutomationStatus() };
  } catch {
    return { configured: true, status: null, error: "Could not fetch workflow status from n8n." };
  }
}

export default async function DashboardPage() {
  const [leads, memory, errors, automationStatus, connection, knowledgeBase] = await Promise.all([
    getLeads(),
    getLeadMemory(),
    getErrors(),
    getInitialAutomationStatus(),
    getConnectionStatus(),
    getKnowledgeBase(),
  ]);

  const metrics = computeDashboardMetrics(leads);
  const activity = buildActivityFeed(leads, memory, errors, 15);
  const mock = isUsingMockData();
  const lastSync = getLastSyncAt("tab:leads");

  // Which automation actions have a webhook configured. Booleans only -- never the URLs.
  const configuredActions: ConfiguredActions = {
    runCampaign: isActionConfigured("runCampaign"),
    pauseCampaign: isActionConfigured("pauseCampaign"),
    resumeCampaign: isActionConfigured("resumeCampaign"),
    refreshKb: isActionConfigured("refreshKb"),
    retryFailed: isActionConfigured("retryFailed"),
  };

  const activeCampaign = getCampaignsSync().find((c) => c.status === "Active") ?? null;
  const readiness = computeCampaignReadiness({
    leads,
    activeCampaign,
    runCampaignConfigured: configuredActions.runCampaign ?? false,
    dataMode: connection.mode,
    sheetsConnected: connection.connected,
    knowledgeBaseUpdatedAt: knowledgeBase.updatedAt,
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of the Biggbee AI outbound outreach system"
        actions={
          <>
            {mock && <Badge variant="accent">Mock data mode</Badge>}
            <DashboardControls lastSyncedAt={lastSync ? new Date(lastSync).toISOString() : null} />
          </>
        }
      />

      <div className="space-y-6">
        <KpiGrid metrics={metrics} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <AutomationCard initialStatus={automationStatus} configured={configuredActions} readiness={readiness} />
          </div>
          <CampaignReadinessCard readiness={readiness} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <ChartCard title="Leads by Country">
            <CountBarChart data={leadsByCountry(leads)} />
          </ChartCard>
          <ChartCard title="Leads by Industry">
            <CountBarChart data={leadsByIndustry(leads)} />
          </ChartCard>
          <ChartCard title="Leads by Service">
            <CountBarChart data={leadsByService(leads)} />
          </ChartCard>
          <ChartCard title="Lead Status">
            <CountPieChart data={leadsByStatus(leads)} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RecentActivity activity={activity} />
          <RecentErrors errors={errors} />
        </div>
      </div>
    </div>
  );
}
