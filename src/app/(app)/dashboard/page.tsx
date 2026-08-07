export const dynamic = "force-dynamic";

import { getConnectionStatus, getErrors, getKnowledgeBase, getLeadMemory, getLeads, isUsingMockData } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getScraperAgents } from "@/lib/data/scraper-registry-store";
import { getScrapingJobs } from "@/lib/data/scraping-jobs-store";
import { getAllProviderHealth } from "@/lib/providers/registry";
import { getLastSyncAt } from "@/lib/data/cache";
import {
  computeDashboardMetrics,
  leadsByCountry,
  leadsByIndustry,
  leadsByService,
  leadsBySource,
  leadsByStatus,
  outreachVolumeOverTime,
} from "@/lib/calculations/dashboard-metrics";
import { buildActivityFeed } from "@/lib/calculations/activity";
import { summarizeDashboardErrors, excludeInternalSenderLeads } from "@/lib/calculations/dashboard-alerts";
import { computeCampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { daysSince } from "@/lib/utils/date";
import { SectionHeader } from "@/components/layout/section-header";
import { CommandHeader } from "@/components/dashboard/command-header";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RecentErrors } from "@/components/dashboard/recent-errors";
import { SystemHealthStrip } from "@/components/dashboard/system-health-strip";
import { LeadGenOverview } from "@/components/dashboard/lead-gen-overview";
import { OutreachPerformanceCard } from "@/components/dashboard/outreach-performance-card";
import { type ConfiguredActions } from "@/components/dashboard/automation-card";
import { CampaignRunPanel } from "@/components/dashboard/campaign-run-panel";
import { ChartCard } from "@/components/charts/chart-card";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { CountPieChart } from "@/components/charts/count-pie-chart";
import { getAutomationStatusAction, getConfiguredActionsAction } from "@/lib/n8n/actions";
import { isN8nApiKeyRequiredButMissing } from "@/lib/config/env-validation";
import { PieChart, Activity, Radar, ShieldAlert } from "lucide-react";

export default async function DashboardPage() {
  const [leads, memory, errors, automationStatus, connection, knowledgeBase, campaigns, configuredActionsRaw, demos, scraperAgents, scrapingJobs, providers] =
    await Promise.all([
      getLeads(),
      getLeadMemory(),
      getErrors(),
      getAutomationStatusAction(),
      getConnectionStatus(),
      getKnowledgeBase(),
      getCampaigns(),
      getConfiguredActionsAction(),
      getDemoLibrary(),
      getScraperAgents(),
      getScrapingJobs(),
      getAllProviderHealth(),
    ]);

  const metrics = computeDashboardMetrics(leads);
  const errorSummary = summarizeDashboardErrors(errors);
  const activity = excludeInternalSenderLeads(buildActivityFeed(leads, memory, errorSummary.active, 15));
  const mock = isUsingMockData();
  const lastSync = getLastSyncAt("tab:leads");
  const lastSyncIso = lastSync ? new Date(lastSync).toISOString() : null;
  const kbAge = daysSince(knowledgeBase.updatedAt);
  const knowledgeBaseHealthy = kbAge !== null && kbAge <= 1;
  const systemsHealthy = providers.filter((p) => p.configured && p.connected).length + (knowledgeBaseHealthy ? 1 : 0);
  const systemsTotal = providers.length + 1;

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
    <div className="space-y-5">
      <CommandHeader
        systemsHealthy={systemsHealthy}
        systemsTotal={systemsTotal}
        hasCriticalIssue={errorSummary.hasCritical}
        lastSyncedAt={lastSyncIso}
        mock={mock}
      />

      <SystemHealthStrip providers={providers} knowledgeBaseHealthy={knowledgeBaseHealthy} />

      <KpiGrid metrics={metrics} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LeadGenOverview agents={scraperAgents} jobs={scrapingJobs} sourceBreakdown={leadsBySource(leads)} />
        <OutreachPerformanceCard leads={leads} volume={outreachVolumeOverTime(leads)} />
      </div>

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

      <div id="automation-control" className="scroll-mt-20">
        <SectionHeader icon={Radar} title="Automation Control" description="The n8n outreach workflow -- controlled from here, executed in n8n" />
        <CampaignRunPanel
          initialStatus={automationStatus}
          configured={configuredActions}
          activeCampaigns={activeCampaigns}
          readinessByCampaignId={readinessByCampaignId}
          noSelectionReadiness={noSelectionReadiness}
        />
      </div>

      <div>
        <SectionHeader
          icon={errorSummary.active.length > 0 ? ShieldAlert : Activity}
          title="Activity & Issues"
          description="What's happened recently, and what needs a look"
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RecentActivity activity={activity} />
          <RecentErrors errors={errorSummary.active} hiddenCount={errorSummary.hiddenCount} />
        </div>
      </div>
    </div>
  );
}
