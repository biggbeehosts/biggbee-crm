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
  // Only auto-select when there's exactly one production Active campaign -- safe and obvious.
  // With none or several, the operator picks explicitly (Section 11 of the final polish brief).
  const [selectedCampaignId, setSelectedCampaignId] = React.useState(activeCampaigns.length === 1 ? activeCampaigns[0].id : "");
  const readiness = (selectedCampaignId && readinessByCampaignId[selectedCampaignId]) || noSelectionReadiness;

  // Gates CampaignReadinessCard's calm default vs. the real checklist -- flips true the first
  // time the operator actually does something, never just because the page loaded (Section 8).
  const [hasInteracted, setHasInteracted] = React.useState(false);

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
          onInteract={() => setHasInteracted(true)}
        />
      </div>
      <CampaignReadinessCard readiness={readiness} hasInteracted={hasInteracted} />
    </div>
  );
}
