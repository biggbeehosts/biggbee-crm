export const dynamic = "force-dynamic";

import { getConnectionStatus, getErrors, getKnowledgeBase, getLeads, isUsingMockData } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getScraperAgents } from "@/lib/data/scraper-registry-store";
import { getScrapingJobs } from "@/lib/data/scraping-jobs-store";
import { getEvents } from "@/lib/data/analytics-events-store";
import { getAllProviderHealth } from "@/lib/providers/registry";
import { getLastSyncAt } from "@/lib/data/cache";
import { computeDashboardMetrics, leadsBySource, outreachVolumeOverTime } from "@/lib/calculations/dashboard-metrics";
import { summarizeDashboardErrors } from "@/lib/calculations/dashboard-alerts";
import { computeCampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { daysSince } from "@/lib/utils/date";
import { CommandHeader } from "@/components/dashboard/command-header";
import { OperationsStatusRow } from "@/components/dashboard/operations-status-row";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { LeadGenOverview } from "@/components/dashboard/lead-gen-overview";
import { OutreachPerformanceCard } from "@/components/dashboard/outreach-performance-card";
import { type ConfiguredActions } from "@/components/dashboard/automation-card";
import { CampaignRunPanel } from "@/components/dashboard/campaign-run-panel";
import { getAutomationStatusAction, getConfiguredActionsAction } from "@/lib/n8n/actions";
import { isN8nApiKeyRequiredButMissing } from "@/lib/config/env-validation";

/** All-time lower bound for the Replies KPI, matching the other primary KPIs (Total Leads, Emails
 *  Sent, ...), which are cumulative rather than range-limited -- getEvents() defaults to a 2-month
 *  window, which would be silently misleading here. */
const EPOCH = new Date(0).toISOString();

export default async function DashboardPage() {
  const [leads, errors, automationStatus, connection, knowledgeBase, campaigns, configuredActionsRaw, demos, scraperAgents, scrapingJobs, providers, replyEvents] =
    await Promise.all([
      getLeads(),
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
      getEvents({ from: EPOCH, to: new Date().toISOString(), type: "reply_received" }),
    ]);

  // Dashboard metrics/charts exclude test data by default (Leads/Campaigns tagged isTest) so a
  // test campaign never inflates what the operator reads as real production numbers -- see
  // Settings -> Data Management for how test data is tagged/cleaned. This never touches the
  // underlying data, only what this read aggregates.
  const productionLeads = leads.filter((l) => !l.isTest);
  const testExcludedCount = leads.length - productionLeads.length;
  // Scraping Jobs have no Is Test column of their own -- test status is derived from the campaign
  // they ran under (see startScrapingJobAction, which already inherits the campaign's isTest flag
  // onto imported leads), so the same exclusion is applied here via campaignId lookup.
  const testCampaignIds = new Set(campaigns.filter((c) => c.isTest).map((c) => c.id));
  const productionScrapingJobs = scrapingJobs.filter((j) => !testCampaignIds.has(j.campaignId));
  // Same cross-reference Analytics uses for events: a reply from a test lead's address is test
  // data too, even though reply_received events aren't individually flagged isTestEvent.
  const testLeadEmails = new Set(leads.filter((l) => l.isTest).map((l) => l.email));
  const replies = replyEvents.filter((e) => !(e.leadId && testLeadEmails.has(e.leadId))).length;

  const metrics = computeDashboardMetrics(productionLeads);
  const errorSummary = summarizeDashboardErrors(errors);
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

  // The compact Operations Status row summarizes the first Active campaign -- actual selection
  // (when more than one is Active) is a client concern owned by the Run Campaign panel below.
  const summaryCampaign = activeCampaigns[0] ?? null;
  const summaryReadiness = summaryCampaign ? readinessByCampaignId[summaryCampaign.id] : noSelectionReadiness;

  return (
    <div className="space-y-5">
      <CommandHeader
        systemsHealthy={systemsHealthy}
        systemsTotal={systemsTotal}
        hasCriticalIssue={errorSummary.hasCritical}
        lastSyncedAt={lastSyncIso}
        mock={mock}
      />

      <OperationsStatusRow
        providers={providers}
        knowledgeBaseHealthy={knowledgeBaseHealthy}
        activeCampaigns={activeCampaigns}
        selectedCampaign={summaryCampaign}
        readiness={summaryReadiness}
        workflowState={automationStatus.status?.state ?? null}
        dataMode={connection.mode}
      />

      <KpiGrid metrics={metrics} replies={replies} />
      {testExcludedCount > 0 && (
        <p className="text-right text-[11px] text-text-tertiary">{testExcludedCount} test record{testExcludedCount === 1 ? "" : "s"} excluded</p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LeadGenOverview agents={scraperAgents} jobs={productionScrapingJobs} sourceBreakdown={leadsBySource(productionLeads)} />
        <OutreachPerformanceCard leads={productionLeads} volume={outreachVolumeOverTime(productionLeads)} replies={replies} />
      </div>

      <div id="automation-control" className="scroll-mt-20">
        <CampaignRunPanel
          initialStatus={automationStatus}
          configured={configuredActions}
          activeCampaigns={activeCampaigns}
          readinessByCampaignId={readinessByCampaignId}
          noSelectionReadiness={noSelectionReadiness}
        />
      </div>
    </div>
  );
}
