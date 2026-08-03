"use client";

import * as React from "react";
import type { Campaign } from "@/types";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";
import type { AutomationStatusResult } from "@/lib/n8n/types";
import { AutomationCard, type ConfiguredActions } from "./automation-card";
import { CampaignReadinessCard } from "./campaign-readiness-card";

/**
 * Owns the one piece of client state Run Campaign needs: which campaign is currently selected.
 * AutomationCard (the controls) and CampaignReadinessCard (the checklist) both render off that
 * same selection, so it's lifted here rather than duplicated -- there is exactly one selected
 * Campaign ID at a time, never an auto-picked "the Active campaign" (more than one campaign can
 * be Active simultaneously).
 */
export function CampaignRunPanel({
  activeCampaigns,
  readinessByCampaignId,
  noSelectionReadiness,
  initialStatus,
  configured,
}: {
  activeCampaigns: Campaign[];
  readinessByCampaignId: Record<string, CampaignReadiness>;
  noSelectionReadiness: CampaignReadiness;
  initialStatus: AutomationStatusResult;
  configured: ConfiguredActions;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = React.useState(activeCampaigns[0]?.id ?? "");
  const readiness = (selectedCampaignId && readinessByCampaignId[selectedCampaignId]) || noSelectionReadiness;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <AutomationCard
          initialStatus={initialStatus}
          configured={configured}
          readiness={readiness}
          activeCampaigns={activeCampaigns}
          selectedCampaignId={selectedCampaignId}
          onSelectedCampaignChange={setSelectedCampaignId}
        />
      </div>
      <CampaignReadinessCard readiness={readiness} />
    </div>
  );
}
