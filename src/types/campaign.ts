export type CampaignStatus = "Active" | "Paused" | "Draft";

export const CAMPAIGN_STATUSES: CampaignStatus[] = ["Active", "Paused", "Draft"];

/**
 * A campaign is a targeting configuration layer over the Leads sheet. It does NOT run outreach
 * itself -- it defines what the current n8n outreach run should focus on, and lets the operator
 * preview exactly which leads match before anything is sent.
 */
export interface Campaign {
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
}

/** Funnel-style breakdown of why leads do or don't match a campaign. */
export interface CampaignMatchSummary {
  availableLeads: number;
  matching: number;
  excludedByStatus: number;
  excludedByCountry: number;
  excludedByIndustry: number;
  excludedByBusinessType: number;
  excludedByLeadGenType: number;
  excludedByService: number;
  belowConfidence: number;
  missingRequiredData: number;
  /** Informational: matching leads that have no website for the research step. */
  missingWebsite: number;
}
