export type ScraperAgentStatus = "Active" | "Disabled" | "Maintenance";

export const SCRAPER_AGENT_STATUSES: ScraperAgentStatus[] = ["Active", "Disabled", "Maintenance"];

/**
 * How the CRM learns a run has finished. "sync-response" covers every scraper today: the start
 * webhook blocks (n8n's default webhook behavior, same as the existing Run Campaign webhook) and
 * the response body itself carries the result counts -- no polling or callback needed. The other
 * two are modeled now so a future long-running scraper can declare a different mode without a
 * registry schema change; nothing in this change implements them.
 */
export type ScraperStatusMethod = "sync-response" | "poll-admin-api" | "webhook-callback";
export type ScraperResultMethod = "sheet" | "poll-admin-api" | "webhook-callback";

export type ScraperAuthType = "header-auth" | "none";

export type ScraperFieldType =
  | "text"
  | "number"
  | "select"
  | "multi-select"
  | "checkbox"
  | "country"
  | "location"
  | "campaign-selector";

export interface ScraperFieldOption {
  label: string;
  value: string;
}

/** One reusable field definition. The scraper-run page renders a form purely from an array of
 *  these -- adding a scraper never requires a new form component. */
export interface ScraperFormField {
  key: string;
  label: string;
  type: ScraperFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  options?: ScraperFieldOption[];
  helpText?: string;
}

export type ScraperFormSchema = ScraperFormField[];

/**
 * A scraper agent record, as stored in the CRM's local JSON registry (never the Sheet -- this is
 * CRM-owned config, not something n8n writes). Holds no secrets: `startWebhookPath` is either a
 * path joined onto N8N_BASE_URL or a full URL whose host must match N8N_BASE_URL's host
 * (validated in the create/update server action), and `startWebhookEnvVar` is only ever a
 * *reference* to an env var name, resolved server-side -- never a value.
 */
export interface ScraperAgent {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** lucide-react icon name, looked up through a fixed allowlist -- never dynamically imported. */
  icon: string;
  status: ScraperAgentStatus;
  n8nWorkflowId: string;
  startWebhookPath: string;
  /** Optional alternative to startWebhookPath: the name of an env var (e.g.
   *  "N8N_WEBHOOK_SCRAPE_GOOGLE_MAPS") whose value is resolved server-side at call time. */
  startWebhookEnvVar?: string;
  statusMethod: ScraperStatusMethod;
  resultMethod: ScraperResultMethod;
  authType: ScraperAuthType;
  defaultMaxLeads: number;
  maxAllowedLeads: number;
  sourceLabel: string;
  /** Which normalized Lead fields this scraper can populate -- informational, shown in the UI. */
  supportedFields: string[];
  formSchema: ScraperFormSchema;
  createdAt: string;
  updatedAt: string;
}

export type ScrapingJobStatus =
  | "Draft"
  | "Queued"
  | "Running"
  | "Completed"
  | "Partially Completed"
  | "Failed"
  | "Cancelled";

export const SCRAPING_JOB_STATUSES: ScrapingJobStatus[] = [
  "Draft",
  "Queued",
  "Running",
  "Completed",
  "Partially Completed",
  "Failed",
  "Cancelled",
];

export interface ScrapingJob {
  id: string;
  scraperId: string;
  scraperName: string;
  campaignId: string;
  campaignName: string;
  n8nExecutionId?: string;
  status: ScrapingJobStatus;
  /** The form inputs this run was started with (category/location/filters/etc.) -- kept so
   *  "Retry" can replay the exact same request rather than just scraperId/campaignId/count. */
  inputs: Record<string, unknown>;
  requestedCount: number;
  scrapedCount: number;
  validCount: number;
  duplicateCount: number;
  importedCount: number;
  errorSummary?: string;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string;
  /** Row position in the Scraping_Jobs sheet tab, used for targeted updates. Absent in mock mode. */
  rowNumber?: number;
}

/** Body sent to a scraper's start webhook -- matches the RunCampaignPayload contract's already-
 *  anticipated shape (see n8n/types.ts). n8n validates campaignId, executes the scraper,
 *  normalizes results, and writes them into the Leads sheet with Status = Staged before this
 *  call's HTTP response (which carries the counts below) ever returns. */
export interface ScraperRunPayload {
  scraperId: string;
  campaignId: string;
  jobId: string;
  requestedCount: number;
  inputs: Record<string, unknown>;
}

export interface ScraperRunResult {
  success: boolean;
  message: string;
  executionId?: string;
  scrapedCount?: number;
  validCount?: number;
  duplicateCount?: number;
  importedCount?: number;
  errors?: string[];
}
