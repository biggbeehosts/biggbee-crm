export type LeadStatus =
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
