import type { Campaign, DemoRecord, Lead } from "@/types";
import { leadEligibleForCampaignRun } from "./campaign-match";
import { resolveCampaignDemo, type DemoMatchResult } from "./demo-match";
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
  selectedCampaignName: string | null;
  targetingSummary: string | null;
  /** How many leads match the selected campaign's targeting and are eligible for a new-lead run
   *  right now (see leadEligibleForCampaignRun) -- includes Unassigned leads that match, excludes
   *  leads claimed by a different campaign. Null when no campaign is selected. */
  campaignMatches: number | null;
  /** Result of resolveCampaignDemo() for the selected campaign -- null when no campaign is
   *  selected. Shown directly in Campaign Readiness (Part H) so the operator sees exactly which
   *  demo (if any) would be attached before running. */
  demoMatch: DemoMatchResult | null;
  canRun: boolean;
  blockReasons: string[];
  /** True only for genuine infrastructure/config failures (webhook not connected, missing prod
   *  auth key, Sheets unreachable) -- never for expected data states like "no eligible leads" or
   *  "no campaign selected". This is the only thing allowed to disable the Run Campaign button
   *  itself; everything else is validated at click time and explained in a friendly dialog
   *  instead (Section 7/22 of the final polish brief -- lack of data is not an error). */
  infraBlocked: boolean;
}

export interface ReadinessInput {
  leads: Lead[];
  /** The campaign the operator explicitly picked to run -- never auto-inferred from "the one
   *  Active campaign", since more than one campaign can be Active at a time. Run Campaign always
   *  requires one of these; there is no "run with no campaign" mode. */
  selectedCampaign: Campaign | null;
  runCampaignConfigured: boolean;
  dataMode: "mock" | "google-sheets";
  sheetsConnected: boolean;
  knowledgeBaseUpdatedAt: string | null;
  /** From env-validation's isN8nApiKeyRequiredButMissing() -- true only in production with no key set. */
  n8nApiKeyRequiredButMissing: boolean;
  /** Live Demo Library, for resolveCampaignDemo() -- same data the n8n workflow itself reads at
   *  send time, so this preview and the actual run-time decision never diverge. */
  demos: DemoRecord[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KB_STALE_DAYS = 7;

function hasUsableEmail(lead: Lead): boolean {
  return EMAIL_RE.test((lead.email ?? "").trim());
}

/**
 * Display-only estimate of what a new-lead run picks up: a contactable address and status "New".
 *
 * NOT filtered by the active campaign -- this is the pre-targeting pool, shown only when no
 * campaign is selected. Once a campaign is selected, countCampaignMatches below (the real,
 * targeting-based eligibility calculation) takes over.
 */
export function countEligibleLeads(leads: Lead[]): number {
  return leads.filter((l) => hasUsableEmail(l) && l.status === "New").length;
}

/**
 * How many leads are eligible for a new Run Campaign send under this campaign right now --
 * matching its targeting fields (Country/Industry/Business Type/Lead Generation Type -- Service is
 * the offer being pitched, never a targeting filter; "Any"/blank = no restriction) and not claimed
 * by a different campaign, on top of every existing
 * safety rule (usable email, Status = New, not previously contacted, confidence floor, production
 * data for a production campaign). This is the SAME leadEligibleForCampaignRun predicate the Run
 * Campaign trigger uses to decide which leads to claim (assign Campaign ID to) immediately before
 * calling n8n (see triggerN8nAction in src/lib/n8n/actions.ts) -- n8n then selects by Campaign ID
 * exactly as before, so what this number shows and what n8n actually processes can never diverge.
 * A lead being Unassigned never excludes it here; a lead already claimed by another campaign does.
 */
export function countCampaignMatches(leads: Lead[], campaign: Campaign): number {
  return leads.filter((l) => leadEligibleForCampaignRun(l, campaign)).length;
}

/** Human-readable summary shown as "Targeting notes" in the Run Campaign dialog. The first four
 *  fields are real eligibility filters (see leadEligibleForCampaignRun) and are listed plainly;
 *  Service is the offer being pitched, not a filter, so it's called out with an explicit label
 *  ("offering: ...") rather than blended in unlabeled the way it would look like a fifth filter. */
function describeTargeting(campaign: Campaign): string {
  const parts = [campaign.country, campaign.industry, campaign.businessType, campaign.leadGenerationType]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  if (campaign.minConfidence !== null) parts.push(`confidence ≥ ${campaign.minConfidence}%`);
  const service = (campaign.service ?? "").trim();
  if (service && service.toLowerCase() !== "any") parts.push(`offering: ${service}`);
  return parts.length ? parts.join(" · ") : "No targeting notes set";
}

export function computeCampaignReadiness(input: ReadinessInput): CampaignReadiness {
  const { leads, selectedCampaign, runCampaignConfigured, dataMode, sheetsConnected, knowledgeBaseUpdatedAt, n8nApiKeyRequiredButMissing, demos } = input;

  const eligibleLeads = countEligibleLeads(leads);
  const campaignMatches = selectedCampaign ? countCampaignMatches(leads, selectedCampaign) : null;
  const demoMatch = selectedCampaign ? resolveCampaignDemo(selectedCampaign, demos) : null;
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

  checks.push(
    n8nApiKeyRequiredButMissing
      ? {
          id: "n8n-auth",
          label: "n8n webhook authentication",
          state: "not-connected",
          detail: "N8N_API_KEY is not set — the production webhook would be unauthenticated",
          blocking: true,
        }
      : { id: "n8n-auth", label: "n8n webhook authentication", state: "ready", detail: "Configured", blocking: false }
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

  const zeroCampaignMatches = selectedCampaign !== null && campaignMatches === 0;
  // Run Campaign always requires an explicit campaign selection -- there is no "run with no
  // campaign" mode, so a missing selection blocks the run exactly like any other unmet
  // precondition. Zero matching leads is an expected first-run state, not an error (§7/13) -- it
  // blocks the run the same way, but is never recorded anywhere as a failure.
  checks.push(
    selectedCampaign
      ? {
          id: "targeting",
          label: "Campaign targeting",
          state: zeroCampaignMatches ? "not-connected" : "ready",
          detail: zeroCampaignMatches
            ? `${selectedCampaign.name} (${selectedCampaign.id}) — 0 leads currently match this campaign's targeting`
            : `${selectedCampaign.name} (${selectedCampaign.id}) — ${campaignMatches} lead${campaignMatches === 1 ? "" : "s"} match this campaign's targeting and are eligible; they're assigned this Campaign ID and n8n selects the same leads`,
          blocking: zeroCampaignMatches,
        }
      : {
          id: "targeting",
          label: "Campaign targeting",
          state: "not-connected",
          detail: "No campaign selected — Run Campaign requires a campaign and never falls back to processing all leads",
          blocking: true,
        }
  );

  // Demo attachment (Part H) -- mirrors resolveCampaignDemo()'s own blocking flag exactly, so
  // this check can never disagree with what n8n would actually do at send time.
  if (selectedCampaign && demoMatch) {
    if (demoMatch.demo) {
      checks.push({
        id: "demo",
        label: "Demo attachment",
        state: "ready",
        detail: `"${demoMatch.demo.name || demoMatch.demo.demoType}" will be attached (${demoMatch.reason})`,
        blocking: false,
      });
    } else if (demoMatch.reason === "none") {
      checks.push({ id: "demo", label: "Demo attachment", state: "ready", detail: "No demo will be attached (Attach Demo off / mode None)", blocking: false });
    } else if (demoMatch.blocking) {
      checks.push({
        id: "demo",
        label: "Demo attachment",
        state: "not-connected",
        detail:
          demoMatch.reason === "exact-id-missing"
            ? `Selected demo "${selectedCampaign.demoId}" was not found in the Demo Library`
            : demoMatch.reason === "exact-id-inactive-or-invalid"
              ? `Selected demo "${selectedCampaign.demoId}" is inactive or has no working URL`
              : "Automatic mode found no matching active demo, and this campaign requires a match",
        blocking: true,
      });
    } else {
      checks.push({
        id: "demo",
        label: "Demo attachment",
        state: "attention",
        detail: "Automatic mode found no matching active demo — this campaign allows sending without one",
        blocking: false,
      });
    }
  }

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
  if (n8nApiKeyRequiredButMissing) blockReasons.push("N8N_API_KEY is required in production but is not set.");
  if (sheetsBlocked) blockReasons.push("Google Sheets is unreachable, so lead data cannot be trusted.");
  if (eligibleLeads === 0) blockReasons.push("There are no eligible leads for a new-lead run.");
  if (!selectedCampaign) blockReasons.push("Select a campaign to run.");
  if (zeroCampaignMatches) blockReasons.push(`No leads currently match "${selectedCampaign!.name}"'s targeting.`);
  if (demoMatch?.blocking) {
    blockReasons.push(
      demoMatch.reason === "exact-id-missing"
        ? `Selected demo "${selectedCampaign!.demoId}" was not found in the Demo Library.`
        : demoMatch.reason === "exact-id-inactive-or-invalid"
          ? `Selected demo "${selectedCampaign!.demoId}" is inactive or has no working URL.`
          : `No demo matches "${selectedCampaign!.name}" and it requires one (Require Demo Match is on).`
    );
  }

  return {
    checks,
    eligibleLeads,
    selectedCampaignName: selectedCampaign?.name ?? null,
    targetingSummary: selectedCampaign ? describeTargeting(selectedCampaign) : null,
    campaignMatches,
    demoMatch,
    canRun: blockReasons.length === 0,
    blockReasons,
    infraBlocked: !runCampaignConfigured || n8nApiKeyRequiredButMissing || sheetsBlocked,
  };
}
