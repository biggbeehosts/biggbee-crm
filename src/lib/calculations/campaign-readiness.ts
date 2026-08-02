import type { Campaign, Lead } from "@/types";
import { leadMatchesCampaign } from "./campaign-match";
import { daysSince } from "@/lib/utils/date";

export type ReadinessState = "ready" | "attention" | "not-connected";

export interface ReadinessCheck {
  id: string;
  label: string;
  state: ReadinessState;
  detail: string;
  /** True when this check alone prevents Run Campaign. */
  blocking: boolean;
}

export interface CampaignReadiness {
  checks: ReadinessCheck[];
  /** Estimated count only -- n8n applies its own cadence/cap rules and makes the final selection. */
  eligibleLeads: number;
  activeCampaignName: string | null;
  targetingSummary: string | null;
  /** How many eligible leads match the active campaign. Informational -- see the note below. */
  campaignMatches: number | null;
  canRun: boolean;
  blockReasons: string[];
}

export interface ReadinessInput {
  leads: Lead[];
  activeCampaign: Campaign | null;
  runCampaignConfigured: boolean;
  dataMode: "mock" | "google-sheets";
  sheetsConnected: boolean;
  knowledgeBaseUpdatedAt: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KB_STALE_DAYS = 7;

function hasUsableEmail(lead: Lead): boolean {
  return EMAIL_RE.test((lead.email ?? "").trim());
}

/**
 * Display-only estimate of what a new-lead run picks up: a contactable address and status "New".
 *
 * Deliberately NOT filtered by the active campaign. Campaign targeting is a CRM-side planning
 * layer -- the Run Campaign webhook's payload is discarded by the workflow's "Tag Mode - New"
 * node (includeOtherFields: false), so n8n processes every eligible lead regardless of campaign.
 * Filtering here would block runs that n8n would happily perform.
 *
 * This is also NOT a reimplementation of the workflow's selection logic -- n8n still owns daily
 * caps, follow-up cadence and same-day dedupe.
 */
export function countEligibleLeads(leads: Lead[]): number {
  return leads.filter((l) => hasUsableEmail(l) && l.status === "New").length;
}

/**
 * How many eligible leads match the active campaign, for context only.
 *
 * Confidence is assigned BY the AI during a run, so an unscored lead is not excluded by a
 * minConfidence threshold here -- only already-scored leads are.
 */
export function countCampaignMatches(leads: Lead[], campaign: Campaign): number {
  const targetingOnly: Campaign = { ...campaign, minConfidence: null };
  return leads.filter((l) => {
    if (!hasUsableEmail(l) || l.status !== "New") return false;
    if (!leadMatchesCampaign(l, targetingOnly)) return false;
    if (campaign.minConfidence !== null && l.confidence !== null && l.confidence < campaign.minConfidence) return false;
    return true;
  }).length;
}

function describeTargeting(campaign: Campaign): string {
  const parts = [campaign.country, campaign.industry, campaign.businessType, campaign.leadGenerationType, campaign.service]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  if (campaign.minConfidence !== null) parts.push(`confidence ≥ ${campaign.minConfidence}%`);
  return parts.length ? parts.join(" · ") : "No targeting filters set";
}

export function computeCampaignReadiness(input: ReadinessInput): CampaignReadiness {
  const { leads, activeCampaign, runCampaignConfigured, dataMode, sheetsConnected, knowledgeBaseUpdatedAt } = input;

  const eligibleLeads = countEligibleLeads(leads);
  const campaignMatches = activeCampaign ? countCampaignMatches(leads, activeCampaign) : null;
  const missingEmail = leads.filter((l) => !hasUsableEmail(l)).length;
  const alreadyContacted = leads.filter((l) => Boolean(l.lastEmailDate)).length;
  const sheetsBlocked = dataMode === "google-sheets" && !sheetsConnected;

  const checks: ReadinessCheck[] = [];

  checks.push(
    runCampaignConfigured
      ? { id: "webhook", label: "Run Campaign automation", state: "ready", detail: "Connected to n8n", blocking: false }
      : {
          id: "webhook",
          label: "Run Campaign automation",
          state: "not-connected",
          detail: "No Run Campaign webhook is configured",
          blocking: true,
        }
  );

  if (dataMode === "mock") {
    checks.push({
      id: "data",
      label: "Lead data source",
      state: "attention",
      detail: "Running on sample data — connect Google Sheets before real outreach",
      blocking: false,
    });
  } else {
    checks.push(
      sheetsConnected
        ? { id: "data", label: "Lead data source", state: "ready", detail: "Google Sheets connected", blocking: false }
        : {
            id: "data",
            label: "Lead data source",
            state: "not-connected",
            detail: "Google Sheets is unreachable",
            blocking: true,
          }
    );
  }

  checks.push(
    eligibleLeads > 0
      ? {
          id: "eligible",
          label: "Eligible leads",
          state: "ready",
          detail: `${eligibleLeads} lead${eligibleLeads === 1 ? "" : "s"} ready for first contact`,
          blocking: false,
        }
      : {
          id: "eligible",
          label: "Eligible leads",
          state: "attention",
          detail: "No leads are currently eligible for a new-lead run",
          blocking: true,
        }
  );

  checks.push(
    missingEmail === 0
      ? { id: "missing-email", label: "Leads missing email", state: "ready", detail: "Every lead has a usable address", blocking: false }
      : {
          id: "missing-email",
          label: "Leads missing email",
          state: "attention",
          detail: `${missingEmail} lead${missingEmail === 1 ? "" : "s"} will be skipped`,
          blocking: false,
        }
  );

  checks.push({
    id: "contacted",
    label: "Leads already contacted",
    state: "ready",
    detail: `${alreadyContacted} previously emailed — excluded from a new-lead run`,
    blocking: false,
  });

  checks.push(
    activeCampaign
      ? {
          id: "targeting",
          label: "Campaign targeting",
          state: "ready",
          detail: `${activeCampaign.name} — ${campaignMatches} of ${eligibleLeads} eligible match (planning only; n8n runs all eligible)`,
          blocking: false,
        }
      : {
          id: "targeting",
          label: "Campaign targeting",
          state: "attention",
          detail: "No active campaign — n8n uses its own lead selection either way",
          blocking: false,
        }
  );

  const kbAge = daysSince(knowledgeBaseUpdatedAt);
  checks.push(
    kbAge === null
      ? { id: "kb", label: "Knowledge base", state: "attention", detail: "Never synced from biggbees.com", blocking: false }
      : kbAge > KB_STALE_DAYS
        ? { id: "kb", label: "Knowledge base", state: "attention", detail: `Last updated ${kbAge} days ago`, blocking: false }
        : { id: "kb", label: "Knowledge base", state: "ready", detail: kbAge <= 0 ? "Updated today" : `Updated ${kbAge} day${kbAge === 1 ? "" : "s"} ago`, blocking: false }
  );

  const blockReasons: string[] = [];
  if (!runCampaignConfigured) blockReasons.push("The Run Campaign automation is not connected to n8n.");
  if (sheetsBlocked) blockReasons.push("Google Sheets is unreachable, so lead data cannot be trusted.");
  if (eligibleLeads === 0) blockReasons.push("There are no eligible leads for a new-lead run.");

  return {
    checks,
    eligibleLeads,
    activeCampaignName: activeCampaign?.name ?? null,
    targetingSummary: activeCampaign ? describeTargeting(activeCampaign) : null,
    campaignMatches,
    canRun: blockReasons.length === 0,
    blockReasons,
  };
}
