import type { Campaign, CampaignMatchSummary, Lead } from "@/types";

const STOP_STATUSES = new Set(["Unsubscribed", "Spam"]);

/**
 * The ONLY membership test: a lead belongs to a campaign if and only if its Campaign ID matches.
 * Industry, country, business type, lead-gen type and service on the Campaign record are
 * targeting notes for the operator (and, later, the scraper) -- they are never used to infer
 * which leads are "in" a campaign, so mixed industries/services in one spreadsheet can never
 * cause a lead to be picked up by the wrong campaign.
 */
export function leadBelongsToCampaign(lead: Lead, campaign: Campaign): boolean {
  return Boolean(lead.campaignId) && lead.campaignId === campaign.id;
}

export function leadsInCampaign(leads: Lead[], campaign: Campaign): Lead[] {
  return leads.filter((l) => leadBelongsToCampaign(l, campaign));
}

/**
 * Whether an in-campaign lead is currently eligible for a Run Campaign send: Status = New AND not
 * previously contacted. This is exactly the gate n8n applies itself (see Prepare Leads For
 * Processing), so the CRM's preview and what actually gets processed never diverge. The
 * campaign's confidence floor, when set, narrows further -- an unscored lead still passes, since
 * the AI assigns confidence during the run itself.
 */
export function leadEligibleForCampaignRun(lead: Lead, campaign: Campaign): boolean {
  if (!leadBelongsToCampaign(lead, campaign)) return false;
  if (STOP_STATUSES.has(lead.status)) return false;
  if (lead.status !== "New") return false;
  if (lead.lastEmailDate || lead.lastContact) return false;
  if (campaign.minConfidence !== null && lead.confidence !== null && lead.confidence < campaign.minConfidence) return false;
  return true;
}

/** Preview list for the Campaigns page -- every lead assigned to this campaign, regardless of
 *  status, so the operator can see the full membership (not just what would send today). */
export function filterCampaignLeads(leads: Lead[], campaign: Campaign): Lead[] {
  return leadsInCampaign(leads, campaign);
}

/**
 * Funnel breakdown over the leads ASSIGNED to this campaign (never the whole pool) -- each
 * excluded lead is counted against the first reason that excludes it, so the buckets sum to
 * (assigned - matching).
 */
export function summarizeCampaignMatch(leads: Lead[], campaign: Campaign): CampaignMatchSummary {
  const assignedLeads = leadsInCampaign(leads, campaign);
  const summary: CampaignMatchSummary = {
    availableLeads: leads.length,
    assigned: assignedLeads.length,
    matching: 0,
    excludedByStatus: 0,
    alreadyContacted: 0,
    belowConfidence: 0,
    missingWebsite: 0,
  };

  for (const lead of assignedLeads) {
    if (STOP_STATUSES.has(lead.status) || lead.status !== "New") {
      summary.excludedByStatus += 1;
      continue;
    }
    if (lead.lastEmailDate || lead.lastContact) {
      summary.alreadyContacted += 1;
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
