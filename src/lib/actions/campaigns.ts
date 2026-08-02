"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteCampaignById, getCampaignSync, upsertCampaign } from "@/lib/data/campaigns-store";
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
});

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveCampaignAction(formData: FormData): Promise<ActionResult> {
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
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid campaign data." };
  }

  const existing = parsed.data.id ? getCampaignSync(parsed.data.id) : undefined;
  const campaign: Campaign = {
    id: parsed.data.id ?? `camp-${Date.now()}`,
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
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  upsertCampaign(campaign);
  revalidatePath("/campaigns");
  return { success: true, message: `Campaign "${campaign.name}" saved.` };
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus): Promise<ActionResult> {
  const campaign = getCampaignSync(id);
  if (!campaign) return { success: false, message: "Campaign not found." };
  upsertCampaign({ ...campaign, status, updatedAt: new Date().toISOString() });
  revalidatePath("/campaigns");
  return { success: true, message: `Campaign ${status === "Active" ? "activated" : status.toLowerCase()}.` };
}

export async function deleteCampaignAction(id: string): Promise<ActionResult> {
  deleteCampaignById(id);
  revalidatePath("/campaigns");
  return { success: true, message: "Campaign deleted." };
}
