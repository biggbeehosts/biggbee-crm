"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createLead, deleteLead, updateLeadFields, updateLeadStatus } from "@/lib/data/leads-mutations";
import { getCampaign } from "@/lib/data/campaigns-store";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";
import type { Lead, LeadStatus } from "@/types";
import { LEAD_STATUSES } from "@/types";

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
  country: z.string().optional(),
  phone: z.string().optional(),
  campaignId: z.string().optional(),
});

/** Empty string means "no campaign" (unassigned/cleared); anything else must be a real,
 *  existing campaign id -- never a free-typed value that silently fails to link anything. */
async function validateCampaignId(campaignId: string | undefined): Promise<string | null> {
  if (!campaignId) return null;
  const campaign = await getCampaign(campaignId);
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
  const actor = await requireAdmin();
  const parsed = NewLeadSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    website: formData.get("website") || undefined,
    industry: formData.get("industry") || undefined,
    country: formData.get("country") || undefined,
    phone: formData.get("phone") || undefined,
    campaignId: formData.get("campaignId") || undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid lead data." };
  }

  const campaignError = await validateCampaignId(parsed.data.campaignId);
  if (campaignError) return { success: false, message: campaignError };

  const lead: Lead = {
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    company: parsed.data.company,
    website: parsed.data.website ?? "",
    industry: parsed.data.industry ?? "",
    businessType: "",
    leadGenerationType: "",
    phone: parsed.data.phone ?? "",
    country: parsed.data.country ?? "",
    status: "New",
    lastContact: null,
    followUpCount: 0,
    lastEmailSubject: "",
    lastEmailDate: null,
    serviceOffered: "",
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
    campaignId: parsed.data.campaignId || undefined,
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
  const actor = await requireAdmin();
  try {
    await updateLeadStatus(email, status);
    revalidateLeadPaths(email);
    await logAudit({ actor, action: "lead.status_change", target: email, success: true, details: { status } });
    return { success: true, message: "Status updated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update status.";
    await logAudit({ actor, action: "lead.status_change_failed", target: email, success: false, details: { error: message } });
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
  // Unlike the other fields, an empty string is meaningful here (clears the assignment), so it's
  // handled separately from the "skip blank values" loop below rather than folded into it.
  campaignId: z.string().optional(),
});

/** Generic partial-field edit, used by the lead detail page's "Edit" action. */
export async function updateLeadAction(email: string, formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
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
    const campaignError = await validateCampaignId(parsed.data.campaignId || undefined);
    if (campaignError) return { success: false, message: campaignError };
  }

  try {
    await updateLeadFields(email, parsed.data);
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
  const actor = await requireAdmin();
  try {
    await deleteLead(email);
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
