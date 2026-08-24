export const dynamic = "force-dynamic";

import { Megaphone, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getWebsiteRegistry } from "@/lib/data/website-registry-store";
import { getOptionListsSync } from "@/lib/data/options-store";
import { getEvents } from "@/lib/data/analytics-events-store";
import { getInboxPlacementTests } from "@/lib/data/deliverability-store";
import { computeTrackingSnapshot, type TrackingSnapshot } from "@/lib/calculations/tracking-metrics";
import { buildCampaignTimeline, type TimelineEvent } from "@/lib/calculations/timeline";
import { PageHeader } from "@/components/layout/page-header";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

const ALL_TIME_FROM = "2020-01-01T00:00:00.000Z";

export default async function CampaignsPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const [leads, campaigns, demos, options, events, placementTests, websites] = await Promise.all([
    getLeads(workspaceId),
    getCampaigns(workspaceId),
    getDemoLibrary(workspaceId),
    getOptionListsSync(),
    getEvents({ from: ALL_TIME_FROM }),
    getInboxPlacementTests(),
    getWebsiteRegistry(),
  ]);

  // Rows written before the Is Test column existed read isTest=false the same as any other
  // missing-field default (correct, backwards-compatible behavior) -- but that also means a
  // legacy internal QA campaign with a never-set cell is currently indistinguishable from a real
  // production one by value alone. Rather than guessing from the name, these are surfaced here
  // for a human to actually mark (see Campaign.isTestUnset doc comment).
  const legacyUnsetCampaigns = campaigns.filter((c) => c.isTestUnset);

  const to = new Date().toISOString();
  // Lifetime, per-campaign snapshot (Part I) -- one getEvents() call above, reduced N times
  // in-memory below, never a second query per campaign.
  const analyticsByCampaign: Record<string, TrackingSnapshot> = {};
  const timelineByCampaign: Record<string, { events: TimelineEvent[]; truncatedFrom: number | null }> = {};
  for (const campaign of campaigns) {
    analyticsByCampaign[campaign.id] = computeTrackingSnapshot({ from: ALL_TIME_FROM, to, campaignId: campaign.id }, leads, campaigns, events, placementTests);
    timelineByCampaign[campaign.id] = buildCampaignTimeline(campaign, events);
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Define what the current outreach run targets, and preview the selection before n8n sends anything"
        actions={<CampaignFormDialog options={options} demos={demos} websites={websites} />}
        icon={Megaphone}
        tone="warning"
      />
      {legacyUnsetCampaigns.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-border-subtle bg-panel p-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
          <p className="text-xs text-text-secondary">
            {legacyUnsetCampaigns.length} campaign{legacyUnsetCampaigns.length === 1 ? "" : "s"} never had a Test/Production value set (
            {legacyUnsetCampaigns.map((c) => c.name).join(", ")}) -- currently treated as production by default. Open <Badge variant="outline">Edit</Badge>{" "}
            on each and set the <span className="font-medium text-text-primary">Test Campaign</span> switch explicitly if any of these
            are actually internal test data.
          </p>
        </div>
      )}
      <CampaignsView
        campaigns={campaigns}
        leads={leads}
        demos={demos}
        options={options}
        websites={websites}
        analyticsByCampaign={analyticsByCampaign}
        timelineByCampaign={timelineByCampaign}
      />
    </div>
  );
}
