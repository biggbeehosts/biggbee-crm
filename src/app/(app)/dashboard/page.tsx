export const dynamic = "force-dynamic";

import { getConnectionStatus, getErrors, getKnowledgeBase, getLeads, isUsingMockData } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getEvents } from "@/lib/data/analytics-events-store";
import { getAllProviderHealth } from "@/lib/providers/registry";
import { getLastSyncAt } from "@/lib/data/cache";
import { getAccountByEmail } from "@/lib/auth/admin-store";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";
import { computeDashboardMetrics, outreachVolumeOverTime } from "@/lib/calculations/dashboard-metrics";
import { summarizeDashboardErrors } from "@/lib/calculations/dashboard-alerts";
import { computeCampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { daysSince } from "@/lib/utils/date";
import { CommandHeader, type OverallState } from "@/components/dashboard/command-header";
import { GettingStartedGuide, type GuideStep } from "@/components/dashboard/getting-started-guide";
import { DashboardHighlights } from "@/components/dashboard/dashboard-highlights";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
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
  const { email, workspaceId } = await pageWorkspaceContext();
  const [leads, errors, automationStatus, connection, knowledgeBase, campaigns, configuredActionsRaw, demos, providers, replyEvents, admin] =
    await Promise.all([
      getLeads(workspaceId),
      getErrors(workspaceId),
      getAutomationStatusAction(),
      getConnectionStatus(),
      getKnowledgeBase(),
      getCampaigns(workspaceId),
      getConfiguredActionsAction(),
      getDemoLibrary(workspaceId),
      getAllProviderHealth(),
      getEvents(workspaceId, { from: EPOCH, to: new Date().toISOString(), type: "reply_received" }),
      getAccountByEmail(email),
    ]);

  // Dashboard metrics/charts exclude test data by default (Leads/Campaigns tagged isTest) so a
  // test campaign never inflates what the operator reads as real production numbers -- see
  // Settings -> Data Management for how test data is tagged/cleaned. This never touches the
  // underlying data, only what this read aggregates.
  const productionLeads = leads.filter((l) => !l.isTest);
  const testExcludedCount = leads.length - productionLeads.length;
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

  // Which automation actions are genuinely available. Booleans only -- never URLs or keys.
  const configuredActions: ConfiguredActions = {
    runCampaign: configuredActionsRaw.runCampaign,
    pauseCampaign: configuredActionsRaw.pauseCampaign,
    resumeCampaign: configuredActionsRaw.resumeCampaign,
    refreshKb: configuredActionsRaw.refreshKb,
    retryFailed: configuredActionsRaw.retryFailed,
  };

  // Test campaigns never appear in the Run Campaign selector -- the real, persisted isTest flag
  // is the only signal used (never the campaign name). Legacy rows written before the Is Test
  // column existed read isTest=false the same as any other missing-field default, so they still
  // count as production here; Campaign.isTestUnset flags them separately (surfaced on /campaigns)
  // for manual review instead of guessing from their name.
  const productionCampaigns = campaigns.filter((c) => !c.isTest);

  // More than one campaign can be Active at once, so readiness is computed per campaign -- the
  // operator picks which one to run client-side (see CampaignRunPanel) rather than the CRM
  // guessing "the" active campaign.
  const activeCampaigns = productionCampaigns.filter((c) => c.status === "Active");
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

  // The hero and the primary highlight cards both summarize the first Active campaign -- actual
  // selection (when more than one is Active) is a client concern owned by the Run Campaign panel.
  const summaryCampaign = activeCampaigns[0] ?? null;
  const summaryReadiness = summaryCampaign ? readinessByCampaignId[summaryCampaign.id] : noSelectionReadiness;

  // Calm-language overall state, infrastructure only (final polish pass, Section 6): 0 leads, no
  // campaign selected, and no outreach sent yet are normal first-run states and must never move
  // this off "Ready" -- only genuine Sheets/provider connectivity problems or a real recent
  // workflow error do that. sheetsDown/anyProviderDown are active current failures; mock mode and
  // an unconfigured provider/webhook are "hasn't been connected yet", not a failure.
  const sheetsDown = connection.mode === "google-sheets" && !connection.connected;
  const anyProviderDown = providers.some((p) => p.configured && !p.connected);
  const anyProviderUnconfigured = providers.some((p) => !p.configured);
  const setupIncomplete = mock || anyProviderUnconfigured || !(configuredActions.runCampaign ?? false);
  const overallState: OverallState =
    errorSummary.hasCritical || sheetsDown || anyProviderDown
      ? "action-needed"
      : setupIncomplete
        ? "setup-incomplete"
        : "ready";

  // Getting Started steps -- every state here traces to real, already-fetched data (Section 11).
  // Dismissal persists per-admin (setSetupGuideDismissed); a genuinely down Sheets connection
  // still forces the guide back regardless of that flag (Section 12's "essential integration
  // becomes completely unconfigured" override).
  const guideSteps: GuideStep[] = [
    {
      id: "sheets",
      title: "Connect Google Sheets",
      description: "Your Leads, Campaigns, and outreach data all live in one spreadsheet.",
      state: connection.mode === "google-sheets" && connection.connected ? "complete" : "needs-setup",
      href: "/settings",
    },
    {
      id: "n8n",
      title: "Confirm n8n connection",
      description: "n8n runs the actual outreach workflow -- Run Campaign needs it connected.",
      state: (configuredActions.runCampaign ?? false) ? "complete" : "needs-setup",
      href: "/settings",
    },
    {
      id: "demo-library",
      title: "Add a demo to the Demo Library",
      description: "Campaigns can attach a demo video automatically when it fits.",
      state: demos.length > 0 ? "complete" : "recommended",
      href: "/automation-hub/demo-library",
    },
    {
      id: "kb",
      title: "Sync your Knowledge Base",
      description: "The AI uses this to write outreach that actually reflects your offering.",
      state: knowledgeBaseHealthy ? "complete" : "recommended",
      href: "/automation-hub/knowledge-base",
    },
    {
      id: "campaign",
      title: "Create a Campaign",
      description: "A campaign defines who Run Campaign should reach out to.",
      state: productionCampaigns.length > 0 ? "complete" : "needs-setup",
      href: "/campaigns",
    },
    {
      id: "leads",
      title: "Add Leads",
      description: "Add leads manually or import them to build a real pipeline.",
      state: productionLeads.length > 0 ? "complete" : "needs-setup",
      href: "/leads",
    },
    {
      id: "outreach",
      title: "Run your first outreach",
      description: "Once a campaign and leads are ready, Run Campaign sends the first batch.",
      state: metrics.emailsSent > 0 ? "complete" : "recommended",
      href: "#automation-control",
    },
  ];
  const showSetupGuide = !admin?.setupGuideDismissed || sheetsDown;

  const heroEligibleLeads = summaryCampaign ? (summaryReadiness.campaignMatches ?? summaryReadiness.eligibleLeads) : null;

  return (
    <div className="space-y-5">
      <CommandHeader
        overallState={overallState}
        lastSyncedAt={lastSyncIso}
        mock={mock}
        campaignName={summaryCampaign?.name ?? null}
        eligibleLeads={heroEligibleLeads}
      />

      {showSetupGuide && <GettingStartedGuide steps={guideSteps} />}

      <DashboardHighlights
        eligibleLeads={heroEligibleLeads ?? summaryReadiness.eligibleLeads}
        totalLeads={productionLeads.length}
        campaign={summaryCampaign}
        readiness={summaryReadiness}
        emailsSent={metrics.emailsSent}
        replies={replies}
        meetings={metrics.meetingsBooked}
      />

      <KpiGrid metrics={metrics} replies={replies} />
      {testExcludedCount > 0 && (
        <p className="text-right text-[11px] text-text-tertiary">{testExcludedCount} test record{testExcludedCount === 1 ? "" : "s"} excluded</p>
      )}

      <OutreachPerformanceCard leads={productionLeads} volume={outreachVolumeOverTime(productionLeads)} replies={replies} />

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
