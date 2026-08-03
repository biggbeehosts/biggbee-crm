export type LeadStatus =
  | "Staged"
  | "New"
  | "Sent"
  | "Contacted"
  | "Interested"
  | "Not Interested"
  | "Meeting Booked"
  | "Customer"
  | "Failed"
  | "Unsubscribed"
  | "Spam"
  | "Needs Review";

export const LEAD_STATUSES: LeadStatus[] = [
  "Staged",
  "New",
  "Sent",
  "Contacted",
  "Interested",
  "Not Interested",
  "Meeting Booked",
  "Customer",
  "Failed",
  "Unsubscribed",
  "Spam",
  "Needs Review",
];

/** Pipeline-specific grouping used by the Kanban board (a subset/remap of LeadStatus). */
export type PipelineStage =
  | "New"
  | "Contacted"
  | "Interested"
  | "Meeting Booked"
  | "Customer"
  | "Failed"
  | "Unsubscribed";

export const PIPELINE_STAGES: PipelineStage[] = [
  "New",
  "Contacted",
  "Interested",
  "Meeting Booked",
  "Customer",
  "Failed",
  "Unsubscribed",
];

export interface Lead {
  /** Primary key across the whole app -- matches the n8n workflow's matching column. */
  email: string;
  name: string;
  company: string;
  website?: string;
  industry?: string;
  businessType?: string;
  leadGenerationType?: string;
  phone?: string;
  country?: string;
  status: LeadStatus;
  lastContact: string | null;
  followUpCount: number;
  lastEmailSubject?: string;
  lastEmailDate: string | null;
  serviceOffered?: string;
  aiSummary?: string;
  demoVideoAttached: boolean;
  demoVideoName?: string;
  subjectVariant?: string;
  alternativeSubject?: string;
  demoRecommended: boolean;
  demoType?: string;
  demoWatchUrl?: string;
  demoDownloadUrl?: string;
  emailStyle?: string;
  /** 0-100, null when the AI has not scored this lead yet. */
  confidence: number | null;
  /** Stable Campaign ID (Campaigns sheet's ID column) this lead is assigned to. Blank/undefined
   *  until an operator assigns one -- never inferred from industry/business type/status. */
  campaignId?: string;
  /** Denormalized campaign name at scrape/create time -- display only, campaignId stays the
   *  source of truth for matching. */
  campaignName?: string;
  /** Stable identifier for this lead row -- set on scraped leads; blank for rows created before
   *  this column existed (never inferred from row position). */
  leadId?: string;
  /** Free-text location string as scraped (e.g. "Austin, TX") -- distinct from Country. */
  location?: string;
  /** The service/niche the scraper searched for, as opposed to serviceOffered (what was actually
   *  pitched during outreach). */
  targetService?: string;
  /** Where this lead came from -- e.g. "Google Maps", "Instagram", "Manual". Blank for rows
   *  written before this column existed. */
  source?: string;
  /** Scraping Jobs id this lead was produced by, if any. */
  scraperJobId?: string;
  /** When this row was created -- set by the scraper/create action; blank for legacy rows. */
  createdAt?: string;
  /** Row position in the source sheet, used for targeted updates. Absent in mock mode. */
  rowNumber?: number;
}

export interface LeadNote {
  id: string;
  leadEmail: string;
  author: string;
  body: string;
  createdAt: string;
}
