export type CampaignStatus = "Active" | "Paused" | "Draft";

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["Active", "Paused", "Draft"];

export type DemoSelectionMode = "Exact" | "Automatic" | "None";

export const DEMO_SELECTION_MODES: DemoSelectionMode[] = ["Exact", "Automatic", "None"];

/** Readable, stable Campaign ID format -- e.g. CMP-000001. Assigned once, on creation, and never
 *  changes when a campaign is renamed or edited. */
export const CAMPAIGN_ID_PATTERN = /^CMP-\d{6,}$/;

/**
 * A campaign is the stable unit every lead, scraper job, demo choice, outreach run, and result is
 * linked through via `id` (the Campaign ID). It does NOT run outreach itself -- it defines what
 * the current n8n outreach run should focus on, and lets the operator preview exactly which leads
 * are assigned before anything is sent. Leads are matched to a campaign by explicit Campaign ID
 * assignment (see Lead.campaignId), never by inferring industry/business type/status alone.
 */
export interface Campaign {
  /** Stable, unique, never changes on rename/edit. Format CMP-000001 (see CAMPAIGN_ID_PATTERN). */
  id: string;
  name: string;
  status: CampaignStatus;
  country?: string;
  industry?: string;
  businessType?: string;
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
  /** Additive "Is Test" column -- when true, leads imported by a scraper run under this campaign
   *  inherit isTest=true at creation (see leads-mutations.ts), and dashboard/analytics metrics
   *  exclude this campaign's leads by default. Missing/blank on any row written before this column
   *  existed reads as `false` -- see normalizeCampaign. Never inferred from the campaign's name. */
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
  /** Row position in the Campaigns sheet tab, used for targeted updates. Absent in mock mode. */
  rowNumber?: number;
}

/**
 * Funnel-style breakdown of a campaign's membership, based entirely on Campaign ID assignment --
 * never industry, business type, or status alone (see leadBelongsToCampaign).
 */
export interface CampaignMatchSummary {
  /** Total leads in the pool, regardless of campaign assignment. */
  availableLeads: number;
  /** Leads whose Campaign ID matches this campaign -- the campaign's actual membership. */
  assigned: number;
  /** Assigned leads currently eligible for a new-lead run (Status = New, not previously
   *  contacted, meets the confidence floor if one is set). */
  matching: number;
  /** Assigned leads excluded because their status stops outreach or isn't New. */
  excludedByStatus: number;
  /** Assigned, New-status leads that already have contact history recorded. */
  alreadyContacted: number;
  /** Assigned, New, uncontacted leads below the campaign's confidence floor. */
  belowConfidence: number;
  /** Informational: matching leads that have no website for the research step. */
  missingWebsite: number;
}
