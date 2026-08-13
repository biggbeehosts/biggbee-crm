import type { Campaign, CampaignMatchSummary, Lead } from "@/types";

const STOP_STATUSES = new Set(["Unsubscribed", "Spam"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasUsableEmail(lead: Lead): boolean {
  return EMAIL_RE.test((lead.email ?? "").trim());
}

/** Case-insensitive, whitespace-normalized compare -- never a fuzzy/partial match. */
function norm(v: string | undefined | null): string {
  return (v ?? "").trim().toLowerCase();
}

/** "Any", blank, undefined, and null all mean "do not restrict by this field" for an optional
 *  campaign targeting field. Otherwise an exact match against the lead's normalized value. */
function fieldMatches(campaignValue: string | undefined, leadValue: string | undefined): boolean {
  const c = norm(campaignValue);
  if (!c || c === "any") return true;
  return c === norm(leadValue);
}

/** The service value used for campaign Service targeting: Lead.targetService takes priority
 *  (the service/niche a lead was scraped/targeted for -- see src/lib/actions/scrapers.ts, which
 *  stamps targetService = campaign.service at scrape time); Lead.serviceOffered is used only as a
 *  fallback when targetService is blank/null/undefined, since manually-added leads never populate
 *  targetService but may have serviceOffered filled in by the operator. */
function resolveLeadService(lead: Lead): string | undefined {
  return lead.targetService?.trim() || lead.serviceOffered?.trim() || undefined;
}

/**
 * Whether a lead matches a campaign's targeting criteria -- Country, Industry, Business Type,
 * Lead Generation Type, and Service. This is the primary eligibility test now (Campaign ID
 * assignment is no longer required for a lead to match): "Any"/blank on a campaign field means
 * that field imposes no restriction (see fieldMatches). Campaign.service is matched against the
 * lead's resolved service (see resolveLeadService).
 */
export function leadMatchesCampaignTargeting(lead: Lead, campaign: Campaign): boolean {
  return (
    fieldMatches(campaign.country, lead.country) &&
    fieldMatches(campaign.industry, lead.industry) &&
    fieldMatches(campaign.businessType, lead.businessType) &&
    fieldMatches(campaign.leadGenerationType, lead.leadGenerationType) &&
    fieldMatches(campaign.service, resolveLeadService(lead))
  );
}

/** Whether a lead is already claimed by a DIFFERENT campaign -- the one thing Campaign ID still
 *  gates: a lead assigned elsewhere is never stolen or double-processed by this campaign, even if
 *  it would otherwise match targeting. Unassigned ("") and already-assigned to THIS campaign both
 *  pass (false). */
function isClaimedByAnotherCampaign(lead: Lead, campaign: Campaign): boolean {
  return Boolean(lead.campaignId) && lead.campaignId !== campaign.id;
}

/** Literal Campaign ID membership -- still used for "assigned to this campaign" reporting/history
 *  (the Campaigns page's Assigned Leads table), never for run eligibility anymore. */
export function leadBelongsToCampaign(lead: Lead, campaign: Campaign): boolean {
  return Boolean(lead.campaignId) && lead.campaignId === campaign.id;
}

export function leadsInCampaign(leads: Lead[], campaign: Campaign): Lead[] {
  return leads.filter((l) => leadBelongsToCampaign(l, campaign));
}

/**
 * The one canonical eligibility rule for a Run Campaign send -- reused by dashboard readiness,
 * the Campaigns/Start Outreach preview, and the actual Run Campaign trigger (see
 * src/lib/n8n/actions.ts), so they can never drift apart. A lead is eligible when it:
 *  - matches the campaign's targeting fields (Any/blank = no restriction on that field);
 *  - is not already claimed by a different campaign (never reassigned/double-processed);
 *  - has a usable email address;
 *  - is Status = New and not a stop-status (Unsubscribed/Spam);
 *  - has not already been contacted (lastEmailDate/lastContact);
 *  - meets the campaign's confidence floor if one is set: unset/null imposes no restriction, but
 *    an explicit floor genuinely excludes both a below-floor score AND an unscored (null) lead --
 *    an explicit minimum confidence is a real requirement, not a "skip if unknown" hint;
 *  - is production data when the campaign is production -- a production campaign never includes
 *    isTest leads (the real isTest flag only, never inferred from the campaign's name).
 * Being Unassigned never makes a lead ineligible on its own -- only a match with THIS campaign's
 * targeting, plus every safety rule above, does.
 */
export function leadEligibleForCampaignRun(lead: Lead, campaign: Campaign): boolean {
  if (!leadMatchesCampaignTargeting(lead, campaign)) return false;
  if (isClaimedByAnotherCampaign(lead, campaign)) return false;
  if (!hasUsableEmail(lead)) return false;
  if (STOP_STATUSES.has(lead.status)) return false;
  if (lead.status !== "New") return false;
  if (lead.lastEmailDate || lead.lastContact) return false;
  if (campaign.minConfidence !== null && (lead.confidence === null || lead.confidence < campaign.minConfidence)) return false;
  if (!campaign.isTest && lead.isTest) return false;
  return true;
}

/** Every lead eligible for a new Run Campaign send under this campaign -- targeting-matched,
 *  not-claimed-elsewhere, and every safety rule in leadEligibleForCampaignRun. */
export function leadsEligibleForCampaign(leads: Lead[], campaign: Campaign): Lead[] {
  return leads.filter((l) => leadEligibleForCampaignRun(l, campaign));
}

/** Preview list for the Campaigns page's "Assigned Leads" table -- literal Campaign ID
 *  membership, regardless of status, so the operator can see current claimed membership (not run
 *  eligibility -- see leadsEligibleForCampaign for that). */
export function filterCampaignLeads(leads: Lead[], campaign: Campaign): Lead[] {
  return leadsInCampaign(leads, campaign);
}

/**
 * Funnel breakdown for a Run Campaign send. `assigned` stays the literal Campaign ID membership
 * count (reporting/history only). Everything else -- `matching` and the exclusion buckets -- is
 * computed over the real candidate pool for a NEW run: every lead that matches this campaign's
 * targeting and isn't claimed by a different campaign (includes Unassigned leads and leads
 * already on this campaign; excludes leads claimed elsewhere). Each excluded candidate is counted
 * against the first reason that excludes it, so the buckets sum to (candidates - matching), and
 * `matching` is true for a lead if and only if leadEligibleForCampaignRun(lead, campaign) is.
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

  const candidates = leads.filter(
    (l) => leadMatchesCampaignTargeting(l, campaign) && !isClaimedByAnotherCampaign(l, campaign) && hasUsableEmail(l) && (campaign.isTest || !l.isTest)
  );

  for (const lead of candidates) {
    if (STOP_STATUSES.has(lead.status) || lead.status !== "New") {
      summary.excludedByStatus += 1;
      continue;
    }
    if (lead.lastEmailDate || lead.lastContact) {
      summary.alreadyContacted += 1;
      continue;
    }
    if (campaign.minConfidence !== null && (lead.confidence === null || lead.confidence < campaign.minConfidence)) {
      summary.belowConfidence += 1;
      continue;
    }
    summary.matching += 1;
    if (!lead.website) summary.missingWebsite += 1;
  }

  return summary;
}
