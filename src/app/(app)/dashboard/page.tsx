export const dynamic = "force-dynamic";

import { getConnectionStatus, getErrors, getKnowledgeBase, getLeadMemory, getLeads, isUsingMockData } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getLastSyncAt } from "@/lib/data/cache";
import { computeDashboardMetrics, leadsByCountry, leadsByIndustry, leadsByService, leadsByStatus } from "@/lib/calculations/dashboard-metrics";
import { buildActivityFeed } from "@/lib/calculations/activity";
import { computeCampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { DashboardControls } from "@/components/dashboard/dashboard-controls";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RecentErrors } from "@/components/dashboard/recent-errors";
import { type ConfiguredActions } from "@/components/dashboard/automation-card";
import { CampaignRunPanel } from "@/components/dashboard/campaign-run-panel";
import { ChartCard } from "@/components/charts/chart-card";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { CountPieChart } from "@/components/charts/count-pie-chart";
import { Badge } from "@/components/ui/badge";
import { getAutomationStatusAction, getConfiguredActionsAction } from "@/lib/n8n/actions";
import { isN8nApiKeyRequiredButMissing } from "@/lib/config/env-validation";
import { PieChart, Activity } from "lucide-react";

export default async function DashboardPage() {
  const [leads, memory, errors, automationStatus, connection, knowledgeBase, campaigns, configuredActionsRaw, demos] = await Promise.all([
    getLeads(),
    getLeadMemory(),
    getErrors(),
    getAutomationStatusAction(),
    getConnectionStatus(),
    getKnowledgeBase(),
    getCampaigns(),
    getConfiguredActionsAction(),
    getDemoLibrary(),
  ]);

  const metrics = computeDashboardMetrics(leads);
  const activity = buildActivityFeed(leads, memory, errors, 15);
  const mock = isUsingMockData();
  const lastSync = getLastSyncAt("tab:leads");

  // Which automation actions are genuinely available. Booleans only -- never URLs or keys.
  const configuredActions: ConfiguredActions = {
    runCampaign: configuredActionsRaw.runCampaign,
    pauseCampaign: configuredActionsRaw.pauseCampaign,
    resumeCampaign: configuredActionsRaw.resumeCampaign,
    refreshKb: configuredActionsRaw.refreshKb,
    retryFailed: configuredActionsRaw.retryFailed,
  };

  // More than one campaign can be Active at once, so readiness is computed per campaign -- the
  // operator picks which one to run client-side (see CampaignRunPanel) rather than the CRM
  // guessing "the" active campaign.
  const activeCampaigns = campaigns.filter((c) => c.status === "Active");
  const readinessBase = {
    leads,
    runCampaignConfigured: configuredActions.runCampaign ?? false,
    dataMode: connection.mode,
    sheetsConnected: connection.connected,
    knowledgeBaseUpdatedAt: knowledgeBase.updatedAt,
    n8nApiKeyRequiredButMissing: isN8nApiKeyRequiredButMissing(),
    demos,
  };
  const readinessByCampaignId = Object.fromEntries(
    activeCampaigns.map((c) => [c.id, computeCampaignReadiness({ ...readinessBase, selectedCampaign: c })])
  );
  const noSelectionReadiness = computeCampaignReadiness({ ...readinessBase, selectedCampaign: null });

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

        <CampaignRunPanel
          initialStatus={automationStatus}
          configured={configuredActions}
          activeCampaigns={activeCampaigns}
          readinessByCampaignId={readinessByCampaignId}
          noSelectionReadiness={noSelectionReadiness}
        />

        <div>
          <SectionHeader icon={PieChart} title="Lead Distribution" description="Where today's leads are coming from and where they stand" />
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
        </div>

        <div>
          <SectionHeader icon={Activity} title="Activity" description="What's happened recently, and what needs a look" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RecentActivity activity={activity} />
            <RecentErrors errors={errors} />
          </div>
        </div>
      </div>
    </div>
  );
}
