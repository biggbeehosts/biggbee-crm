"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ScraperAgentStatus, ScraperFieldType, ScraperFormField, ScraperRunResult, ScrapingJobStatus } from "@/types";
import { SCRAPER_AGENT_STATUSES } from "@/types";
import {
  createScraperAgent,
  deleteScraperAgent,
  getScraperAgent,
  getScraperAgents,
  updateScraperAgent,
} from "@/lib/data/scraper-registry-store";
import { createScrapingJob, deleteScrapingJob, generateJobId, getScrapingJob, updateScrapingJob } from "@/lib/data/scraping-jobs-store";
import { getCampaign } from "@/lib/data/campaigns-store";
import { runScraper, cancelScraperRun } from "@/lib/n8n/scraper-client";
import { isAllowedN8nHost } from "@/lib/n8n/config";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateLeadGenPaths() {
  revalidatePath("/lead-generation/scrapers");
  revalidatePath("/lead-generation/scraping-jobs");
  revalidatePath("/lead-generation/scraped-leads");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

// ── Scraper agent registry ──────────────────────────────────────────────────────────────────

const FIELD_TYPES: ScraperFieldType[] = ["text", "number", "select", "multi-select", "checkbox", "country", "location", "campaign-selector"];

const FormFieldSchema: z.ZodType<ScraperFormField> = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES as [ScraperFieldType, ...ScraperFieldType[]]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  helpText: z.string().optional(),
});

const AgentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and hyphens only"),
  description: z.string().min(1, "Description is required"),
  icon: z.string().min(1, "Icon is required"),
  n8nWorkflowId: z.string().min(1, "n8n workflow ID is required"),
  startWebhookPath: z.string().min(1, "Webhook path or URL is required"),
  startWebhookEnvVar: z.string().optional(),
  sourceLabel: z.string().min(1, "Source label is required"),
  defaultMaxLeads: z.coerce.number().int().min(1, "Default lead limit must be at least 1"),
  maxAllowedLeads: z.coerce.number().int().min(1, "Maximum lead limit must be at least 1"),
  supportedFields: z.array(z.string()).default([]),
  formSchema: z.array(FormFieldSchema).default([]),
});

/** Guards Part B's "do not allow arbitrary browser-supplied external URLs to be invoked
 *  directly": a bare path is always fine (joined onto N8N_BASE_URL at call time); a full URL is
 *  only accepted if its host matches N8N_BASE_URL's. */
function validateWebhookPath(raw: string): string | null {
  if (/^https?:\/\//i.test(raw) && !isAllowedN8nHost(raw)) {
    return "Webhook URL must be on the same host as N8N_BASE_URL, or entered as a bare path (e.g. \"webhook/my-scraper\").";
  }
  return null;
}

function parseAgentForm(formData: FormData) {
  const supportedFieldsRaw = String(formData.get("supportedFields") ?? "");
  const formSchemaRaw = String(formData.get("formSchemaJson") ?? "[]");
  let formSchema: unknown = [];
  try {
    formSchema = JSON.parse(formSchemaRaw);
  } catch {
    formSchema = [];
  }

  return AgentSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    icon: formData.get("icon"),
    n8nWorkflowId: formData.get("n8nWorkflowId"),
    startWebhookPath: formData.get("startWebhookPath"),
    startWebhookEnvVar: formData.get("startWebhookEnvVar") || undefined,
    sourceLabel: formData.get("sourceLabel"),
    defaultMaxLeads: formData.get("defaultMaxLeads"),
    maxAllowedLeads: formData.get("maxAllowedLeads"),
    supportedFields: supportedFieldsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    formSchema,
  });
}

export async function createScraperAgentAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsed = parseAgentForm(formData);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid scraper agent data." };
  }

  const webhookError = validateWebhookPath(parsed.data.startWebhookPath);
  if (webhookError) return { success: false, message: webhookError };

  if (parsed.data.maxAllowedLeads < parsed.data.defaultMaxLeads) {
    return { success: false, message: "Maximum lead limit must be at least the default lead limit." };
  }

  const existing = await getScraperAgents();
  if (existing.some((a) => a.slug === parsed.data.slug)) {
    return { success: false, message: `Slug "${parsed.data.slug}" is already in use.` };
  }

  try {
    const agent = await createScraperAgent({
      ...parsed.data,
      status: "Active",
      statusMethod: "sync-response",
      resultMethod: "sheet",
      authType: "header-auth",
    });
    revalidateLeadGenPaths();
    await logAudit({ actor, action: "scraper_agent.create", target: agent.id, success: true, details: { name: agent.name, slug: agent.slug } });
    return { success: true, message: `${agent.name} added to the Scraper Agents registry.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create scraper agent.";
    await logAudit({ actor, action: "scraper_agent.create_failed", success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function updateScraperAgentAction(id: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsed = parseAgentForm(formData);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid scraper agent data." };
  }

  const webhookError = validateWebhookPath(parsed.data.startWebhookPath);
  if (webhookError) return { success: false, message: webhookError };

  if (parsed.data.maxAllowedLeads < parsed.data.defaultMaxLeads) {
    return { success: false, message: "Maximum lead limit must be at least the default lead limit." };
  }

  const existing = await getScraperAgents();
  const clash = existing.find((a) => a.slug === parsed.data.slug && a.id !== id);
  if (clash) return { success: false, message: `Slug "${parsed.data.slug}" is already in use.` };

  try {
    const agent = await updateScraperAgent(id, parsed.data);
    revalidateLeadGenPaths();
    await logAudit({ actor, action: "scraper_agent.update", target: id, success: true, details: { name: agent.name } });
    return { success: true, message: `${agent.name} updated.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update scraper agent.";
    await logAudit({ actor, action: "scraper_agent.update_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function setScraperAgentStatusAction(id: string, status: ScraperAgentStatus): Promise<ActionResult> {
  const actor = await requireAdmin();
  if (!SCRAPER_AGENT_STATUSES.includes(status)) {
    return { success: false, message: "Unknown scraper agent status." };
  }
  try {
    const agent = await updateScraperAgent(id, { status });
    revalidateLeadGenPaths();
    await logAudit({ actor, action: "scraper_agent.status_change", target: id, success: true, details: { status } });
    return { success: true, message: `${agent.name} is now ${status}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update scraper agent status.";
    await logAudit({ actor, action: "scraper_agent.status_change_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function deleteScraperAgentAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    const agent = await getScraperAgent(id);
    await deleteScraperAgent(id);
    revalidateLeadGenPaths();
    await logAudit({ actor, action: "scraper_agent.delete", target: id, success: true, details: { name: agent?.name } });
    return { success: true, message: `${agent?.name ?? "Scraper agent"} removed.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete scraper agent.";
    await logAudit({ actor, action: "scraper_agent.delete_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}

// ── Scraping jobs ────────────────────────────────────────────────────────────────────────────

export interface StartScrapingJobResult extends ActionResult {
  jobId?: string;
}

function statusFromResult(result: ScraperRunResult): ScrapingJobStatus {
  if (!result.success) return "Failed";
  const requested = result.scrapedCount ?? 0;
  const imported = result.importedCount ?? 0;
  if ((result.errors?.length ?? 0) > 0 && imported > 0 && imported < requested) return "Partially Completed";
  if (result.errors?.length && imported === 0) return "Failed";
  return "Completed";
}

/**
 * Runs a scraper: validates the agent and campaign are eligible, creates a Draft/Queued job
 * record, calls the scraper's start webhook, and finalizes the job from its synchronous response.
 * This never triggers outreach -- it only produces Status = Staged rows in the Leads sheet (the
 * scraper's own n8n workflow enforces that, validated again here client-side before the call).
 */
export async function startScrapingJobAction(
  scraperId: string,
  campaignId: string,
  requestedCount: number,
  inputs: Record<string, unknown>
): Promise<StartScrapingJobResult> {
  const actor = await requireAdmin();

  const agent = await getScraperAgent(scraperId);
  if (!agent) return { success: false, message: "Unknown scraper agent." };
  if (agent.status !== "Active") {
    return { success: false, message: `${agent.name} is ${agent.status}, not Active. Enable it before running.` };
  }

  const trimmedCampaignId = (campaignId ?? "").trim();
  if (!trimmedCampaignId) {
    return { success: false, message: "Select a campaign to run — every scraper run requires a Campaign ID." };
  }
  const campaign = await getCampaign(trimmedCampaignId);
  if (!campaign) {
    return { success: false, message: `Unknown campaign "${trimmedCampaignId}". Refresh and try again.` };
  }
  if (campaign.status !== "Active") {
    return { success: false, message: `Campaign "${campaign.name}" is ${campaign.status}, not Active. Activate it before scraping into it.` };
  }

  const count = Math.trunc(requestedCount);
  if (!Number.isFinite(count) || count < 1) {
    return { success: false, message: "Number of leads/profiles must be at least 1." };
  }
  if (count > agent.maxAllowedLeads) {
    return { success: false, message: `${agent.name} allows at most ${agent.maxAllowedLeads} per run.` };
  }

  const jobId = generateJobId();
  const startedAt = new Date().toISOString();
  await createScrapingJob({
    id: jobId,
    scraperId: agent.id,
    scraperName: agent.name,
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: "Running",
    inputs,
    requestedCount: count,
    scrapedCount: 0,
    validCount: 0,
    duplicateCount: 0,
    importedCount: 0,
    startedAt,
    completedAt: null,
    createdBy: actor,
  });
  await logAudit({ actor, action: "scraping_job.start", target: jobId, success: true, details: { scraperId: agent.id, campaignId: campaign.id, requestedCount: count } });
  revalidateLeadGenPaths();

  const result = await runScraper(agent, { scraperId: agent.id, campaignId: campaign.id, jobId, requestedCount: count, inputs });

  await updateScrapingJob(jobId, {
    status: statusFromResult(result),
    n8nExecutionId: result.executionId,
    scrapedCount: result.scrapedCount ?? 0,
    validCount: result.validCount ?? 0,
    duplicateCount: result.duplicateCount ?? 0,
    importedCount: result.importedCount ?? 0,
    errorSummary: result.errors?.join("; ") || (result.success ? undefined : result.message),
    completedAt: new Date().toISOString(),
  });
  await logAudit({ actor, action: "scraping_job.complete", target: jobId, success: result.success, details: { message: result.message, importedCount: result.importedCount } });
  revalidateLeadGenPaths();

  return { success: result.success, message: result.message, jobId };
}

/** Replays a completed/failed job's original scraperId/campaignId/requestedCount/inputs as a
 *  brand-new job (never mutates the original record, so run history stays intact). */
export async function retryScrapingJobAction(jobId: string): Promise<StartScrapingJobResult> {
  await requireAdmin();
  const job = await getScrapingJob(jobId);
  if (!job) return { success: false, message: "Scraping job was not found." };
  return startScrapingJobAction(job.scraperId, job.campaignId, job.requestedCount, job.inputs);
}

export async function cancelScrapingJobAction(jobId: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const job = await getScrapingJob(jobId);
  if (!job) return { success: false, message: "Scraping job was not found." };
  if (job.status !== "Queued" && job.status !== "Running") {
    return { success: false, message: `Job is already ${job.status} -- nothing to cancel.` };
  }

  const aborted = cancelScraperRun(jobId);
  if (aborted) {
    await updateScrapingJob(jobId, { status: "Cancelled", completedAt: new Date().toISOString() });
    revalidateLeadGenPaths();
    await logAudit({ actor, action: "scraping_job.cancel", target: jobId, success: true });
    return { success: true, message: "Job cancelled." };
  }

  await logAudit({ actor, action: "scraping_job.cancel_failed", target: jobId, success: false, details: { reason: "no in-flight call found" } });
  return { success: false, message: "This job is no longer cancellable (its run already finished, or the server restarted since it started)." };
}

export async function deleteScrapingJobAction(jobId: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    await deleteScrapingJob(jobId);
    revalidateLeadGenPaths();
    await logAudit({ actor, action: "scraping_job.delete", target: jobId, success: true });
    return { success: true, message: "Job record deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete job record.";
    await logAudit({ actor, action: "scraping_job.delete_failed", target: jobId, success: false, details: { error: message } });
    return { success: false, message };
  }
}
