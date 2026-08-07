export const dynamic = "force-dynamic";

import { Megaphone } from "lucide-react";
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

const ALL_TIME_FROM = "2020-01-01T00:00:00.000Z";

export default async function CampaignsPage() {
  const [leads, campaigns, demos, options, events, placementTests, websites] = await Promise.all([
    getLeads(),
    getCampaigns(),
    getDemoLibrary(),
    getOptionListsSync(),
    getEvents({ from: ALL_TIME_FROM }),
    getInboxPlacementTests(),
    getWebsiteRegistry(),
  ]);

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
