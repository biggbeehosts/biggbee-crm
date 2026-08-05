"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteCampaignById, generateNextCampaignId, getCampaign, upsertCampaign } from "@/lib/data/campaigns-store";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";
import { invalidateCache } from "@/lib/data/cache";
import type { Campaign, CampaignStatus } from "@/types";
import type { ActionResult } from "./leads";

const CampaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Campaign name is required"),
  status: z.enum(["Active", "Paused", "Draft"]),
  country: z.string().optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  service: z.string().optional(),
  leadGenerationType: z.string().optional(),
  minConfidence: z.union([z.number().min(0).max(100), z.null()]),
  maxLeadsPerRun: z.union([z.number().int().positive(), z.null()]),
  dailySendLimit: z.union([z.number().int().positive(), z.null()]),
  notes: z.string().optional(),
  openTrackingEnabled: z.boolean(),
  clickTrackingEnabled: z.boolean(),
  replyTrackingEnabled: z.boolean(),
  deliverabilityTestEnabled: z.boolean(),
});

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveCampaignAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();

  const parsed = CampaignSchema.safeParse({
    id: String(formData.get("id") || "") || undefined,
    name: formData.get("name"),
    status: formData.get("status"),
    country: String(formData.get("country") || ""),
    industry: String(formData.get("industry") || ""),
    businessType: String(formData.get("businessType") || ""),
    service: String(formData.get("service") || ""),
    leadGenerationType: String(formData.get("leadGenerationType") || ""),
    minConfidence: numOrNull(formData.get("minConfidence")),
    maxLeadsPerRun: numOrNull(formData.get("maxLeadsPerRun")),
    dailySendLimit: numOrNull(formData.get("dailySendLimit")),
    notes: String(formData.get("notes") || ""),
    openTrackingEnabled: formData.get("openTrackingEnabled") === "on" || formData.get("openTrackingEnabled") === "true",
    clickTrackingEnabled: formData.get("clickTrackingEnabled") === "on" || formData.get("clickTrackingEnabled") === "true",
    replyTrackingEnabled: formData.get("replyTrackingEnabled") === "on" || formData.get("replyTrackingEnabled") === "true",
    deliverabilityTestEnabled: formData.get("deliverabilityTestEnabled") === "on" || formData.get("deliverabilityTestEnabled") === "true",
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid campaign data." };
  }

  try {
    const existing = parsed.data.id ? await getCampaign(parsed.data.id) : undefined;
    const isNew = !existing;
    // Campaign ID is assigned once, on creation, and never changes on rename/edit -- an edit
    // always carries the existing id in `parsed.data.id` (see the hidden form field).
    const campaign: Campaign = {
      id: parsed.data.id ?? (await generateNextCampaignId()),
      name: parsed.data.name,
      status: parsed.data.status,
      country: parsed.data.country,
      industry: parsed.data.industry,
      businessType: parsed.data.businessType,
      service: parsed.data.service,
      leadGenerationType: parsed.data.leadGenerationType,
      minConfidence: parsed.data.minConfidence,
      maxLeadsPerRun: parsed.data.maxLeadsPerRun,
      dailySendLimit: parsed.data.dailySendLimit,
      notes: parsed.data.notes,
      openTrackingEnabled: parsed.data.openTrackingEnabled,
      clickTrackingEnabled: parsed.data.clickTrackingEnabled,
      replyTrackingEnabled: parsed.data.replyTrackingEnabled,
      deliverabilityTestEnabled: parsed.data.deliverabilityTestEnabled,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertCampaign(campaign);
    invalidateCache();
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    await logAudit({
      actor,
      action: isNew ? "campaign.create" : "campaign.update",
      target: campaign.id,
      success: true,
      details: { name: campaign.name, status: campaign.status },
    });
    return { success: true, message: `Campaign "${campaign.name}" saved.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save campaign.";
    await logAudit({ actor, action: "campaign.save_failed", success: false, details: { error: message } });
    return { success: false, message };
  }
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    const campaign = await getCampaign(id);
    if (!campaign) return { success: false, message: "Campaign not found." };
    await upsertCampaign({ ...campaign, status, updatedAt: new Date().toISOString() });
    invalidateCache();
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    await logAudit({ actor, action: "campaign.status_change", target: id, success: true, details: { status } });
    return { success: true, message: `Campaign ${status === "Active" ? "activated" : status.toLowerCase()}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update campaign status.";
    await logAudit({ actor, action: "campaign.status_change_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}

/** Duplicates a campaign as a new Draft, so admins can iterate on targeting without touching a
 *  live campaign in place. */
export async function duplicateCampaignAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    const source = await getCampaign(id);
    if (!source) return { success: false, message: "Campaign not found." };
    const copy: Campaign = {
      ...source,
      id: await generateNextCampaignId(),
      name: `${source.name} (copy)`,
      status: "Draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rowNumber: undefined,
    };
    await upsertCampaign(copy);
    invalidateCache();
    revalidatePath("/campaigns");
    await logAudit({ actor, action: "campaign.duplicate", target: copy.id, success: true, details: { sourceId: id } });
    return { success: true, message: `Duplicated as "${copy.name}".` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to duplicate campaign.";
    return { success: false, message };
  }
}

export async function deleteCampaignAction(id: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  try {
    const campaign = await getCampaign(id);
    await deleteCampaignById(id);
    invalidateCache();
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    await logAudit({ actor, action: "campaign.delete", target: id, success: true, details: { name: campaign?.name } });
    return { success: true, message: "Campaign deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete campaign.";
    await logAudit({ actor, action: "campaign.delete_failed", target: id, success: false, details: { error: message } });
    return { success: false, message };
  }
}
