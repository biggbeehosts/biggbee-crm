export type CampaignStatus = "Active" | "Paused" | "Draft";

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["Active", "Paused", "Draft"];

export type DemoSelectionMode = "Exact" | "Automatic" | "None";

export const DEMO_SELECTION_MODES: DemoSelectionMode[] = ["Exact", "Automatic", "None"];

/** Readable, stable Campaign ID format -- e.g. CMP-000001. Assigned once, on creation, and never
 *  changes when a campaign is renamed or edited. */
export const CAMPAIGN_ID_PATTERN = /^CMP-\d{6,}$/;

/**
 * A campaign is the stable unit every lead, demo choice, outreach run, and result is linked
 * through via `id` (the Campaign ID). It does NOT run outreach itself -- it defines what
 * the current n8n outreach run should focus on, and lets the operator preview exactly which leads
 * are eligible before anything is sent. A lead becomes eligible for a run by matching this
 * campaign's TARGETING fields only -- Country, Industry, Business Type, and Lead Generation Type
 * ("Any"/blank means no restriction on that field) -- and not being claimed by a different
 * campaign; it does not need to carry this Campaign ID beforehand (see leadEligibleForCampaignRun
 * in src/lib/calculations/campaign-match.ts). `service` is deliberately NOT a targeting/eligibility
 * field: it describes the OFFER this campaign pitches (what Biggbee is selling), not a property a
 * lead must already have, and it flows through to the outbound workflow (n8n reads it directly off
 * this campaign's sheet row) without ever filtering which leads qualify. Campaign ID assignment on
 * Lead.campaignId still records which campaign actually claimed/processed a lead -- Run Campaign
 * writes it onto every matching lead at the moment it runs, so it remains meaningful for
 * history/reporting and so a lead already claimed by another campaign is never reassigned or
 * double-processed.
 */
export interface Campaign {
  /** Stable, unique, never changes on rename/edit. Format CMP-000001 (see CAMPAIGN_ID_PATTERN). */
  id: string;
  name: string;
  status: CampaignStatus;
  country?: string;
  industry?: string;
  businessType?: string;
  /** The service/product this campaign pitches -- the OFFER, never a lead-eligibility filter. See
   *  the class doc comment above. Flows through to the outbound workflow as what to pitch. */
  service?: string;
  leadGenerationType?: string;
  /** Targeting language, e.g. "English", "Spanish" -- matched against DemoRecord.language in the
   *  demo-selection cascade (Stage 6, Part 7) and, once linked, against the Website Registry's
   *  knowledge base for this campaign. */
  language?: string;
  /** 0-100; null = no confidence requirement. */
  minConfidence: number | null;
  maxLeadsPerRun: number | null;
  dailySendLimit: number | null;
  notes?: string;
  /** Whether this campaign attaches a demo at all -- false short-circuits selection entirely
   *  regardless of demoSelectionMode/demoId (see resolveCampaignDemo). */
  attachDemo: boolean;
  /** Persisted Demo ID, never a display name -- resolved against the live Demo Library at run
   *  time, not cached/denormalized, so a demo edited or deactivated after assignment is caught. */
  demoId?: string;
  demoSelectionMode: DemoSelectionMode;
  /** Automatic mode with no match, or Exact mode with an invalid Demo ID: true blocks the run
   *  entirely; false allows sending without a demo (logged, never silent). Exact-mode-invalid is
   *  always blocking regardless of this flag -- an explicitly assigned demo disappearing is
   *  never treated as "no preference." */
  requireDemoMatch: boolean;
  /** Stage 5 tracking toggles (Part C). n8n's Prepare Final Email node reads these (via the same
   *  Campaigns-sheet lookup it already does for demo resolution) to decide whether to inject the
   *  tracking pixel / wrap links for this campaign's sends. Default true/true/true/false per
   *  product decision -- tracking on by default, deliverability testing opt-in. */
  openTrackingEnabled: boolean;
  clickTrackingEnabled: boolean;
  replyTrackingEnabled: boolean;
  deliverabilityTestEnabled: boolean;
  /** Optional link to a Website Registry entry (Stage 6, Part 8/9) -- when set, the outreach AI
   *  uses that site's knowledge base instead of the default (Biggbee's own); when unset, behavior
   *  is unchanged from before this field existed (falls back to the default KB). */
  websiteId?: string;
  /** Additive "Is Test" column -- when true, leads created under this campaign inherit
   *  isTest=true at creation (see leads-mutations.ts), and dashboard/analytics metrics exclude
   *  this campaign's leads by default. Missing/blank on any row written before this column
   *  existed reads as `false` -- see normalizeCampaign. Never inferred from the campaign's name. */
  isTest: boolean;
  /** Read-only, derived at load time -- true only when the raw "Is Test" cell is genuinely blank
   *  (never explicitly set to TRUE or FALSE), as opposed to a row that was explicitly marked
   *  production. Never written back, never used to change `isTest`'s own value or default (that
   *  stays `false` either way, per the additive-schema backwards-compatibility rule) -- this
   *  exists solely so legacy pre-Is-Test rows (e.g. old internal QA campaigns created before this
   *  column existed) can be surfaced for manual admin review instead of being silently assumed
   *  production, without resorting to name-based detection. See fromRow() in campaigns-store.ts. */
  isTestUnset?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Row position in the Campaigns sheet tab, used for targeted updates. Absent in mock mode. */
  rowNumber?: number;
}

/**
 * Funnel-style breakdown of a campaign's Run Campaign eligibility. `assigned` is still literal
 * Campaign ID membership (reporting/history only, see leadBelongsToCampaign); everything else is
 * computed over the real candidate pool for a new run -- every lead matching this campaign's
 * targeting (Country/Industry/Business Type/Lead Generation Type only -- Service is the offer, not
 * a targeting field; "Any"/blank = no restriction) that isn't already claimed by a different
 * campaign, regardless of whether it
 * carries this Campaign ID yet (see leadEligibleForCampaignRun / summarizeCampaignMatch).
 */
export interface CampaignMatchSummary {
  /** Total leads in the pool, regardless of campaign assignment or targeting. */
  availableLeads: number;
  /** Leads whose Campaign ID already matches this campaign -- historical/claimed membership,
   *  not run eligibility. */
  assigned: number;
  /** Leads matching this campaign's targeting, not claimed by another campaign, and eligible for
   *  a new-lead run right now (usable email, Status = New, not previously contacted, meets the
   *  confidence floor if one is set, production data for a production campaign). */
  matching: number;
  /** Targeting-matched candidates excluded because their status stops outreach or isn't New. */
  excludedByStatus: number;
  /** Targeting-matched, New-status candidates that already have contact history recorded. */
  alreadyContacted: number;
  /** Targeting-matched, New, uncontacted candidates below the campaign's confidence floor. */
  belowConfidence: number;
  /** Informational: matching leads that have no website for the research step. */
  missingWebsite: number;
}
