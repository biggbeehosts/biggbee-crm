export type CampaignStatus = "Active" | "Paused" | "Draft";

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["Active", "Paused", "Draft"];

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
  /** 0-100; null = no confidence requirement. */
  minConfidence: number | null;
  maxLeadsPerRun: number | null;
  dailySendLimit: number | null;
  notes?: string;
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
