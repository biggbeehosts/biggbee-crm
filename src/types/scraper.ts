export type ScraperAgentStatus = "Active" | "Disabled" | "Maintenance";

export const SCRAPER_AGENT_STATUSES: ScraperAgentStatus[] = ["Active", "Disabled", "Maintenance"];

/** Stage 6, Part 1/9: which Automation Hub sub-page this agent belongs under. "Lead Source" is
 *  every agent that scrapes/imports leads (Google Maps, Instagram, ...); "AI Agent" is every
 *  other automation registered the same way (voice agent, cold calling, appointment booking,
 *  ...). Both kinds share one store/type/form -- this field is purely a display split, never a
 *  behavioral one. Defaults to "Lead Source" for every agent registered before this field existed
 *  (see backfill() in scraper-registry-store.ts), so existing agents are unaffected. */
export type ScraperAgentCategory = "Lead Source" | "AI Agent";

export const SCRAPER_AGENT_CATEGORIES: ScraperAgentCategory[] = ["Lead Source", "AI Agent"];

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

/** Shared vocabulary with WorkflowIntegration (src/types/workflow-registry.ts) -- a scraper
 *  agent IS the Scraper-purpose entry in the Change 4 workflow registry, so these fields live
 *  directly on ScraperAgent instead of a second, easily-drifting store. All new fields are
 *  optional/backfilled at read time (see scraper-registry-store.ts) so pre-Change-4 agent
 *  records keep working with no migration step. */
export type WorkflowConnectionStatus = "connected" | "error" | "unknown" | "unconfigured";

/** One historical workflow assignment -- what Replace Assignment and the Advanced "deploy as new
 *  version" action append to, and what Rollback reads from. The n8n workflow a version points
 *  away from is never edited or deleted (Parts C/F). */
export interface ScraperVersionEntry {
  n8nWorkflowId: string;
  startWebhookPath: string;
  startWebhookEnvVar?: string;
  versionHash: string | null;
  note: string;
  createdAt: string;
  createdBy: string;
}

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
  /** Stage 6, Part 1/9 -- see ScraperAgentCategory doc comment. */
  category: ScraperAgentCategory;
  /** Stage 6, Part 2 registry capability flags -- informational, shown as badges in the Automation
   *  Hub / Scraper Registry cards. supportsCampaigns is true for every agent today (campaign
   *  selection is already hard-required in the run payload); the other three describe whether the
   *  agent's own flow includes a review-before-import step, a bulk approve/reject action, and
   *  duplicate-lead detection respectively -- set per agent, never assumed. */
  supportsCampaigns: boolean;
  supportsPreview: boolean;
  supportsApproval: boolean;
  supportsDuplicateDetection: boolean;
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
  /** Change 4 registry fields -- see WorkflowConnectionStatus doc comment above. Defaulted at
   *  read time for records created before this change. */
  connectionStatus: WorkflowConnectionStatus;
  lastVerifiedAt: string | null;
  lastSuccessfulExecution: string | null;
  lastFailedExecution: string | null;
  lastErrorSummary?: string;
  currentVersionHash: string | null;
  /** Field names the CRM guarantees to send / expects back -- shown read-only in the Workflow
   *  Control card (Part B "View Input/Output Schema"); the actual contract is enforced in code
   *  (see ScraperRunPayload / contract-validation.ts), not driven by this list. */
  expectedInputSchema: string[];
  expectedOutputSchema: string[];
  versionHistory: ScraperVersionEntry[];
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
  /** True for a Part C/J.10 one-result validation run -- clamped to requestedCount 1 by the
   *  server action regardless of what was asked for. Kept in run history like any other job,
   *  just labeled, so a dry run is never confused with a real production run. */
  isDryRun?: boolean;
}

/**
 * Body sent to a scraper's start webhook. This is the Part D generic scraper execution
 * contract -- every scraper receives the same shape, so the n8n side stays one generic,
 * configuration-driven workflow rather than one bespoke workflow per source. `source`,
 * `version` and `campaign` are additive on top of the fields the already-live Google Maps /
 * Instagram workflows were verified against in Change 2 (scraperId, campaignId, jobId,
 * requestedCount, inputs) -- n8n ignores unknown fields, so adding these never breaks an
 * existing, already-verified webhook.
 */
export interface ScraperRunPayload {
  version: 1;
  jobId: string;
  scraperId: string;
  campaignId: string;
  requestedCount: number;
  /** The scraper's sourceLabel, slugified (e.g. "google-maps") -- lets one generic n8n workflow
   *  branch on source without needing a different webhook per scraper. */
  source: string;
  inputs: Record<string, unknown>;
  /** Targeting context copied from the live Campaign record at call time (never cached/denormalized
   *  onto the agent) -- informational for the n8n workflow/operator, not a lead-selection filter. */
  campaign: {
    targetService: string | null;
    industry: string | null;
    businessType: string | null;
    leadGenerationType: string | null;
    /** Additive field -- the assigned campaign's own Is Test flag. The current n8n scraper
     *  subflows do not read this yet (they write lead rows directly and would need a node change
     *  to also write "Is Test"); sent so the payload contract is ready for that follow-up without
     *  breaking anything for a workflow that ignores unknown fields today. */
    isTest: boolean;
  };
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
