import type { Campaign, CampaignMatchSummary, Lead } from "@/types";

const STOP_STATUSES = new Set(["Unsubscribed", "Spam"]);

/**
 * Loose bidirectional contains-match so sheet values like "Instagram Lead Generation Agency"
 * match a target of "Lead Generation Agency", and "Instagram DM funnels" matches "Instagram".
 * An unset target always passes (criterion not used).
 */
function matchesText(leadValue: string | undefined, target: string | undefined): boolean {
  const t = (target ?? "").trim().toLowerCase();
  if (!t) return true;
  const v = (leadValue ?? "").trim().toLowerCase();
  if (!v) return false;
  return v.includes(t) || t.includes(v);
}

/**
 * The service criterion is what the campaign WANTS to pitch; lead.serviceOffered is what the AI
 * already selected. A lead the AI hasn't processed yet (empty serviceOffered) still matches --
 * the workflow will pick the service on its run.
 */
function matchesService(leadValue: string | undefined, target: string | undefined): boolean {
  const t = (target ?? "").trim().toLowerCase();
  if (!t) return true;
  const v = (leadValue ?? "").trim().toLowerCase();
  if (!v) return true;
  return v.includes(t) || t.includes(v);
}

export function leadMatchesCampaign(lead: Lead, campaign: Campaign): boolean {
  if (STOP_STATUSES.has(lead.status)) return false;
  if (!matchesText(lead.country, campaign.country)) return false;
  if (!matchesText(lead.industry, campaign.industry)) return false;
  if (!matchesText(lead.businessType, campaign.businessType)) return false;
  if (!matchesText(lead.leadGenerationType, campaign.leadGenerationType)) return false;
  if (!matchesService(lead.serviceOffered, campaign.service)) return false;
  if (campaign.minConfidence !== null) {
    if (lead.confidence === null) return false;
    if (lead.confidence < campaign.minConfidence) return false;
  }
  return true;
}

export function filterCampaignLeads(leads: Lead[], campaign: Campaign): Lead[] {
  return leads.filter((l) => leadMatchesCampaign(l, campaign));
}

/**
 * Funnel breakdown: each excluded lead is counted against the FIRST criterion that rejected it,
 * so the buckets sum to (availableLeads - matching) and read naturally top-to-bottom.
 */
export function summarizeCampaignMatch(leads: Lead[], campaign: Campaign): CampaignMatchSummary {
  const summary: CampaignMatchSummary = {
    availableLeads: leads.length,
    matching: 0,
    excludedByStatus: 0,
    excludedByCountry: 0,
    excludedByIndustry: 0,
    excludedByBusinessType: 0,
    excludedByLeadGenType: 0,
    excludedByService: 0,
    belowConfidence: 0,
    missingRequiredData: 0,
    missingWebsite: 0,
  };

  for (const lead of leads) {
    if (STOP_STATUSES.has(lead.status)) {
      summary.excludedByStatus += 1;
      continue;
    }
    if (!matchesText(lead.country, campaign.country)) {
      summary.excludedByCountry += 1;
      continue;
    }
    if (!matchesText(lead.industry, campaign.industry)) {
      summary.excludedByIndustry += 1;
      continue;
    }
    if (!matchesText(lead.businessType, campaign.businessType)) {
      summary.excludedByBusinessType += 1;
      continue;
    }
    if (!matchesText(lead.leadGenerationType, campaign.leadGenerationType)) {
      summary.excludedByLeadGenType += 1;
      continue;
    }
    if (!matchesService(lead.serviceOffered, campaign.service)) {
      summary.excludedByService += 1;
      continue;
    }
    if (campaign.minConfidence !== null && lead.confidence === null) {
      summary.missingRequiredData += 1;
      continue;
    }
    if (campaign.minConfidence !== null && lead.confidence !== null && lead.confidence < campaign.minConfidence) {
      summary.belowConfidence += 1;
      continue;
    }
    summary.matching += 1;
    if (!lead.website) summary.missingWebsite += 1;
  }

  return summary;
}
