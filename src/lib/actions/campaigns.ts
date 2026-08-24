"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteCampaignById, generateNextCampaignId, getCampaign, upsertCampaign } from "@/lib/data/campaigns-store";
import { requireWorkspaceContext } from "@/lib/auth/workspace-context";
import { logAudit } from "@/lib/audit/log";
import { invalidateCache } from "@/lib/data/cache";
import type { Campaign, CampaignStatus, DemoSelectionMode } from "@/types";
import { getDemo } from "@/lib/data/demo-library-store";
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
  attachDemo: z.boolean(),
  demoSelectionMode: z.enum(["Exact", "Automatic", "None"]),
  demoId: z.string().optional(),
  requireDemoMatch: z.boolean(),
  openTrackingEnabled: z.boolean(),
  clickTrackingEnabled: z.boolean(),
  replyTrackingEnabled: z.boolean(),
  deliverabilityTestEnabled: z.boolean(),
  websiteId: z.string().optional(),
  isTest: z.boolean(),
});

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveCampaignAction(formData: FormData): Promise<ActionResult> {
  const { email: actor, workspaceId } = await requireWorkspaceContext();

  const parsed = CampaignSchema.safeParse({
    id: String(formData.get("id") || "") || undefined,
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? ""),
    country: String(formData.get("country") || ""),
    industry: String(formData.get("industry") || ""),
    businessType: String(formData.get("businessType") || ""),
    service: String(formData.get("service") || ""),
    leadGenerationType: String(formData.get("leadGenerationType") || ""),
    minConfidence: numOrNull(formData.get("minConfidence")),
    maxLeadsPerRun: numOrNull(formData.get("maxLeadsPerRun")),
    dailySendLimit: numOrNull(formData.get("dailySendLimit")),
    notes: String(formData.get("notes") || ""),
    attachDemo: formData.get("attachDemo") === "on" || formData.get("attachDemo") === "true",
    demoSelectionMode: String(formData.get("demoSelectionMode") || "None"),
    demoId: String(formData.get("demoId") || "") || undefined,
    requireDemoMatch: formData.get("requireDemoMatch") === "on" || formData.get("requireDemoMatch") === "true",
    openTrackingEnabled: formData.get("openTrackingEnabled") === "on" || formData.get("openTrackingEnabled") === "true",
    clickTrackingEnabled: formData.get("clickTrackingEnabled") === "on" || formData.get("clickTrackingEnabled") === "true",
    replyTrackingEnabled: formData.get("replyTrackingEnabled") === "on" || formData.get("replyTrackingEnabled") === "true",
    deliverabilityTestEnabled: formData.get("deliverabilityTestEnabled") === "on" || formData.get("deliverabilityTestEnabled") === "true",
    websiteId: String(formData.get("websiteId") || "") || undefined,
    isTest: formData.get("isTest") === "on" || formData.get("isTest") === "true",
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid campaign data." };
  }

  // Exact mode requires a real, active Demo ID up front -- never persisted as "Exact" with a
  // blank/dangling id that would silently block outreach later without the operator knowing why.
  if (parsed.data.attachDemo && parsed.data.demoSelectionMode === "Exact") {
    const demoId = (parsed.data.demoId ?? "").trim();
    if (!demoId) return { success: false, message: "Exact mode requires selecting a demo." };
    const demo = await getDemo(demoId, workspaceId);
    if (!demo) return { success: false, message: `Unknown demo "${demoId}".` };
    if (!demo.active) return { success: false, message: `"${demo.name || demo.demoType}" is inactive — choose an active demo or a different mode.` };
  }

  try {
    const existing = parsed.data.id ? await getCampaign(parsed.data.id, workspaceId) : undefined;
    const isNew = !existing;
    // Campaign ID is assigned once, on creation, and never changes on rename/edit -- an edit
    // always carries the existing id in `parsed.data.id` (see the hidden form field).
    const campaign: Campaign = {
      id: parsed.data.id ?? (await generateNextCampaignId()),
      workspaceId,
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
      attachDemo: parsed.data.attachDemo,
      demoSelectionMode: parsed.data.demoSelectionMode as DemoSelectionMode,
      demoId: parsed.data.demoSelectionMode === "Exact" ? parsed.data.demoId : undefined,
      requireDemoMatch: parsed.data.requireDemoMatch,
      openTrackingEnabled: parsed.data.openTrackingEnabled,
      clickTrackingEnabled: parsed.data.clickTrackingEnabled,
      replyTrackingEnabled: parsed.data.replyTrackingEnabled,
      deliverabilityTestEnabled: parsed.data.deliverabilityTestEnabled,
      websiteId: parsed.data.websiteId,
      isTest: parsed.data.isTest,
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
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    const campaign = await getCampaign(id, workspaceId);
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
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    const source = await getCampaign(id, workspaceId);
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
  const { email: actor, workspaceId } = await requireWorkspaceContext();
  try {
    const campaign = await getCampaign(id, workspaceId);
    await deleteCampaignById(id, workspaceId);
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
