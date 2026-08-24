"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  bulkDeleteLeads,
  bulkUpdateLeadFields,
  bulkUpdateLeadStatus,
  createLead,
  deleteLead,
  updateLeadFields,
  updateLeadStatus,
} from "@/lib/data/leads-mutations";
import { getCampaign } from "@/lib/data/campaigns-store";
import { requireWorkspaceContext } from "@/lib/auth/workspace-context";
import { logAudit } from "@/lib/audit/log";
import type { Lead, LeadStatus } from "@/types";
import { LEAD_STATUSES } from "@/types";
import { recordEvent } from "@/lib/data/analytics-events-store";
import { sha256Hex } from "@/lib/auth/crypto";

export interface ActionResult {
  success: boolean;
  message: string;
}

const NewLeadSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  email: z.string().email("Enter a valid email address"),
  website: z.string().optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  leadGenerationType: z.string().optional(),
  serviceOffered: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  campaignId: z.string().min(1, "Select a campaign."),
});

/** Stage 6, Part 4: every lead must carry a Campaign ID -- blank is never accepted here, and the
 *  id must be a real, existing campaign, never a free-typed value that silently fails to link
 *  anything. */
async function validateCampaignId(workspaceId: string, campaignId: string | undefined): Promise<string | null> {
  if (!campaignId) return "Select a campaign.";
  const campaign = await getCampaign(campaignId, workspaceId);
  if (!campaign) return `Unknown campaign "${campaignId}".`;
  return null;
}

function revalidateLeadPaths(email?: string) {
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/campaigns");
  if (email) revalidatePath(`/leads/${encodeURIComponent(email)}`);
}

export async function addLeadAction(formData: FormData): Promise<ActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const parsed = NewLeadSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    website: formData.get("website") || undefined,
    industry: formData.get("industry") || undefined,
    businessType: formData.get("businessType") || undefined,
    leadGenerationType: formData.get("leadGenerationType") || undefined,
    serviceOffered: formData.get("serviceOffered") || undefined,
    country: formData.get("country") || undefined,
    phone: formData.get("phone") || undefined,
    campaignId: formData.get("campaignId") || undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid lead data." };
  }

  const campaignError = await validateCampaignId(workspaceId, parsed.data.campaignId);
  if (campaignError) return { success: false, message: campaignError };
  // Inherits the assigned campaign's Is Test flag at creation -- a lead added under a test
  // campaign is test data too.
  const assignedCampaign = await getCampaign(parsed.data.campaignId, workspaceId);

  const lead: Lead = {
    workspaceId,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    company: parsed.data.company,
    website: parsed.data.website ?? "",
    industry: parsed.data.industry ?? "",
    businessType: parsed.data.businessType ?? "",
    leadGenerationType: parsed.data.leadGenerationType ?? "",
    phone: parsed.data.phone ?? "",
    country: parsed.data.country ?? "",
    status: "New",
    lastContact: null,
    followUpCount: 0,
    lastEmailSubject: "",
    lastEmailDate: null,
    serviceOffered: parsed.data.serviceOffered ?? "",
    aiSummary: "",
    demoVideoAttached: false,
    demoVideoName: "",
    subjectVariant: "",
    alternativeSubject: "",
    demoRecommended: false,
    demoType: "",
    demoWatchUrl: "",
    demoDownloadUrl: "",
    emailStyle: "",
    confidence: null,
    campaignId: parsed.data.campaignId,
    isTest: assignedCampaign?.isTest ?? false,
  };

  try {
    await createLead(lead);
    revalidateLeadPaths();
    await logAudit({ actor, action: "lead.create", target: lead.email, success: true, details: { company: lead.company, campaignId: lead.campaignId } });
    return { success: true, message: `${lead.company} added to the Leads sheet.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add lead.";
    await logAudit({ actor, action: "lead.create_failed", success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function updateLeadStatusAction(email: string, status: LeadStatus): Promise<ActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    await updateLeadStatus(workspaceId, email, status);
    revalidateLeadPaths(email);
    await logAudit({ actor, action: "lead.status_change", target: email, success: true, details: { status } });
    return { success: true, message: "Status updated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update status.";
    await logAudit({ actor, action: "lead.status_change_failed", target: email, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function setLeadTestFlagAction(email: string, isTest: boolean): Promise<ActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    await updateLeadFields(workspaceId, email, { isTest });
    revalidateLeadPaths(email);
    await logAudit({ actor, action: "lead.test_flag_change", target: email, success: true, details: { isTest } });
    return { success: true, message: isTest ? "Marked as test data." : "Marked as production." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update test flag.";
    await logAudit({ actor, action: "lead.test_flag_change_failed", target: email, success: false, details: { error: message } });
    return { success: false, message };
  }
}

const EditLeadSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  leadGenerationType: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  serviceOffered: z.string().optional(),
  status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]).optional(),
  // Stage 6, Part 4: a lead's Campaign ID can be reassigned but never cleared to blank, so this
  // is handled separately from the "skip blank values" loop below rather than folded into it.
  campaignId: z.string().min(1, "Select a campaign.").optional(),
});

/** Generic partial-field edit, used by the lead detail page's "Edit" action. */
export async function updateLeadAction(email: string, formData: FormData): Promise<ActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const raw: Record<string, string> = {};
  for (const key of ["name", "company", "website", "industry", "businessType", "leadGenerationType", "phone", "country", "serviceOffered", "status"]) {
    const value = formData.get(key);
    if (value !== null && String(value).trim() !== "") raw[key] = String(value);
  }
  const campaignIdField = formData.get("campaignId");
  if (campaignIdField !== null) raw.campaignId = String(campaignIdField);

  const parsed = EditLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid lead data." };
  }

  if ("campaignId" in raw) {
    const campaignError = await validateCampaignId(workspaceId, parsed.data.campaignId || undefined);
    if (campaignError) return { success: false, message: campaignError };
  }

  try {
    await updateLeadFields(workspaceId, email, parsed.data);
    revalidateLeadPaths(email);
    await logAudit({
      actor,
      action: "lead.update",
      target: email,
      success: true,
      details: "campaignId" in raw ? { fields: Object.keys(parsed.data), campaignId: parsed.data.campaignId || null } : { fields: Object.keys(parsed.data) },
    });
    return { success: true, message: "Lead updated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update lead.";
    await logAudit({ actor, action: "lead.update_failed", target: email, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function deleteLeadAction(email: string): Promise<ActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    await deleteLead(workspaceId, email);
    revalidateLeadPaths();
    await logAudit({ actor, action: "lead.delete", target: email, success: true });
    return { success: true, message: "Lead deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete lead.";
    await logAudit({ actor, action: "lead.delete_failed", target: email, success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function refreshDataAction(): Promise<ActionResult> {
  const { refreshAllData } = await import("@/lib/data/repository");
  refreshAllData();
  revalidatePath("/", "layout");
  return { success: true, message: "Data refreshed." };
}

// ── Scraped Leads review queue (Change 2) ───────────────────────────────────────────────────
// Approval changes Staged -> New; only Status = New is eligible for outreach (see
// src/lib/n8n/actions.ts's runCampaign, which selects by Campaign ID + Status = New). Reject
// keeps the row (audit trail) rather than deleting it -- Delete is a separate, explicit action.

function revalidateScrapedLeadsPaths() {
  revalidatePath("/lead-generation/scraped-leads");
  revalidateLeadPaths();
}

export interface BulkActionResult extends ActionResult {
  succeeded: string[];
  failed: { email: string; error: string }[];
}

function summarizeBulk(action: string, succeeded: string[], failed: { email: string; error: string }[]): BulkActionResult {
  const success = failed.length === 0;
  const message =
    failed.length === 0
      ? `${succeeded.length} lead${succeeded.length === 1 ? "" : "s"} ${action}.`
      : `${succeeded.length} ${action}, ${failed.length} failed: ${failed.map((f) => f.email).join(", ")}`;
  return { success, message, succeeded, failed };
}

function recordLeadDecisionEvents(type: "lead_approved" | "lead_rejected", emails: string[]) {
  const at = new Date().toISOString();
  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    recordEvent({
      type,
      leadId: normalized,
      emailHash: sha256Hex(normalized),
      recipientDomain: normalized.split("@")[1],
      source: "crm",
      timestamp: at,
      isUnique: true,
      isBotOrScanner: false,
      isTestEvent: false,
    }).catch(() => {});
  }
}

export async function approveLeadsAction(emails: string[]): Promise<BulkActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const { updated, failed } = await bulkUpdateLeadStatus(workspaceId, emails, "New");
  revalidateScrapedLeadsPaths();
  recordLeadDecisionEvents("lead_approved", updated);
  await logAudit({ actor, action: "lead.bulk_approve", success: failed.length === 0, details: { count: updated.length, failed: failed.length } });
  return summarizeBulk("approved", updated, failed);
}

export async function rejectLeadsAction(emails: string[]): Promise<BulkActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const { updated, failed } = await bulkUpdateLeadStatus(workspaceId, emails, "Not Interested");
  revalidateScrapedLeadsPaths();
  recordLeadDecisionEvents("lead_rejected", updated);
  await logAudit({ actor, action: "lead.bulk_reject", success: failed.length === 0, details: { count: updated.length, failed: failed.length } });
  return summarizeBulk("rejected", updated, failed);
}

export async function bulkDeleteLeadsAction(emails: string[]): Promise<BulkActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const { deleted, failed } = await bulkDeleteLeads(workspaceId, emails);
  revalidateScrapedLeadsPaths();
  await logAudit({ actor, action: "lead.bulk_delete", success: failed.length === 0, details: { count: deleted.length, failed: failed.length } });
  return summarizeBulk("deleted", deleted, failed);
}

/** Main Leads-page bulk toolbar (distinct from the Scraped Leads review queue above) -- assign
 *  campaign, change status, and mark test/production all go through the same generic
 *  bulkUpdateLeadFields path rather than one bespoke implementation per action. */
export async function bulkAssignCampaignAction(emails: string[], campaignId: string): Promise<BulkActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const campaignError = await validateCampaignId(workspaceId, campaignId);
  if (campaignError) return { success: false, message: campaignError, succeeded: [], failed: [] };
  const campaign = await getCampaign(campaignId, workspaceId);
  const { updated, failed } = await bulkUpdateLeadFields(workspaceId, emails, { campaignId, campaignName: campaign?.name ?? "" });
  revalidateLeadPaths();
  await logAudit({ actor, action: "lead.bulk_assign_campaign", success: failed.length === 0, details: { campaignId, count: updated.length, failed: failed.length } });
  return summarizeBulk("reassigned", updated, failed);
}

export async function bulkChangeStatusAction(emails: string[], status: LeadStatus): Promise<BulkActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const { updated, failed } = await bulkUpdateLeadFields(workspaceId, emails, { status });
  revalidateLeadPaths();
  await logAudit({ actor, action: "lead.bulk_status_change", success: failed.length === 0, details: { status, count: updated.length, failed: failed.length } });
  return summarizeBulk("updated", updated, failed);
}

export async function bulkSetTestFlagAction(emails: string[], isTest: boolean): Promise<BulkActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  const { updated, failed } = await bulkUpdateLeadFields(workspaceId, emails, { isTest });
  revalidateLeadPaths();
  await logAudit({
    actor,
    action: "lead.bulk_test_flag_change",
    success: failed.length === 0,
    details: { isTest, count: updated.length, failed: failed.length },
  });
  return summarizeBulk(isTest ? "marked test" : "marked production", updated, failed);
}
