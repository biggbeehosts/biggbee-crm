"use server";

import { revalidatePath } from "next/cache";
import { fetchAutomationStatus, triggerWebhook } from "./client";
import { fetchWorkflowStatusSafe, isAdminApiConfigured, pauseWorkflow, resumeWorkflow } from "./admin-client";
import { isActionConfigured, type N8nActionKey } from "./config";
import type { AutomationStatusResult, RunCampaignPayload, TriggerResult } from "./types";
import { refreshAllData } from "@/lib/data/repository";
import { getCampaign } from "@/lib/data/campaigns-store";
import { retryFailedLeads } from "@/lib/data/leads-mutations";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";

/** Which trigger actions the UI may call (status and sync go through their own paths). */
const TRIGGERABLE: N8nActionKey[] = ["runCampaign", "pauseCampaign", "resumeCampaign", "refreshKb", "retryFailed"];

export interface TriggerActionParams {
  /** Required for "runCampaign" -- the Campaign ID the operator explicitly selected. Never
   *  optional/inferred: there is no "run with no campaign" mode. */
  campaignId?: string;
}

export async function triggerN8nAction(action: N8nActionKey, params: TriggerActionParams = {}): Promise<TriggerResult> {
  const actor = await requireAdmin();
  if (!TRIGGERABLE.includes(action)) {
    return { success: false, message: "Unknown automation action." };
  }

  // Pause/resume are real n8n admin-API calls (workflow active toggle), not webhooks.
  if (action === "pauseCampaign" || action === "resumeCampaign") {
    const result = action === "pauseCampaign" ? await pauseWorkflow() : await resumeWorkflow();
    await logAudit({ actor, action: `n8n.${action}`, success: result.success, details: { message: result.message } });
    if (result.success) {
      refreshAllData();
      revalidatePath("/", "layout");
    }
    return result;
  }

  // Retry Failed is a direct Sheets write (Status: Failed -> New) -- no n8n workflow change
  // needed; the next scheduled/triggered run picks these leads up naturally.
  if (action === "retryFailed") {
    try {
      const count = await retryFailedLeads();
      await logAudit({ actor, action: "n8n.retryFailed", success: true, details: { count } });
      refreshAllData();
      revalidatePath("/", "layout");
      return {
        success: true,
        message: count > 0 ? `${count} failed lead${count === 1 ? "" : "s"} reset to New — picked up by the next run.` : "No failed leads to retry.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to retry leads.";
      await logAudit({ actor, action: "n8n.retryFailed", success: false, details: { error: message } });
      return { success: false, message };
    }
  }

  // Run Campaign always carries an explicit, validated Campaign ID -- n8n selects leads by
  // Campaign ID = this value AND Status = New AND not previously contacted (see Prepare Leads
  // For Processing in the workflow). There is no fallback to "all eligible leads": a missing or
  // unknown campaignId is rejected here, before n8n is ever called.
  let payload: Record<string, unknown> = {};
  if (action === "runCampaign") {
    const campaignId = (params.campaignId ?? "").trim();
    if (!campaignId) {
      const message = "Select a campaign to run — Run Campaign requires a Campaign ID.";
      await logAudit({ actor, action: "n8n.runCampaign", success: false, details: { error: message } });
      return { success: false, message };
    }
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      const message = `Unknown campaign "${campaignId}". Refresh and try again.`;
      await logAudit({ actor, action: "n8n.runCampaign", success: false, target: campaignId, details: { error: message } });
      return { success: false, message };
    }
    if (campaign.status !== "Active") {
      const message = `Campaign "${campaign.name}" is ${campaign.status}, not Active. Activate it before running.`;
      await logAudit({ actor, action: "n8n.runCampaign", success: false, target: campaign.id, details: { error: message } });
      return { success: false, message };
    }
    const runPayload: RunCampaignPayload = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      country: campaign.country || undefined,
      industry: campaign.industry || undefined,
      businessType: campaign.businessType || undefined,
      leadGenerationType: campaign.leadGenerationType || undefined,
      service: campaign.service || undefined,
      minConfidence: campaign.minConfidence ?? undefined,
      maxLeadsPerRun: campaign.maxLeadsPerRun ?? undefined,
      dailySendLimit: campaign.dailySendLimit ?? undefined,
    };
    payload = { ...runPayload };
  }

  const result = await triggerWebhook(action, payload);
  await logAudit({ actor, action: `n8n.${action}`, success: result.success, target: params.campaignId, details: { message: result.message, payload } });
  if (result.success) {
    // n8n writes results to the sheet; drop the cache so the next render shows them.
    refreshAllData();
    revalidatePath("/", "layout");
  }
  return result;
}

/**
 * Sync is deliberately local: invalidate the sheet cache and re-render. Nothing more.
 * (N8N_WEBHOOK_SYNC is reserved for a future n8n-side sync workflow.)
 */
export async function syncCrmAction(): Promise<TriggerResult> {
  refreshAllData();
  revalidatePath("/", "layout");
  return { success: true, message: "CRM synced — data reloaded from Google Sheets." };
}

export async function getAutomationStatusAction(): Promise<AutomationStatusResult> {
  if (isAdminApiConfigured()) {
    return fetchWorkflowStatusSafe();
  }
  if (!isActionConfigured("status")) {
    return { configured: false, status: null };
  }
  try {
    const status = await fetchAutomationStatus();
    return { configured: true, status };
  } catch {
    return { configured: true, status: null, error: "Could not fetch workflow status from n8n." };
  }
}

export async function getConfiguredActionsAction(): Promise<Record<string, boolean>> {
  const adminApi = isAdminApiConfigured();
  return {
    runCampaign: isActionConfigured("runCampaign"),
    pauseCampaign: adminApi || isActionConfigured("pauseCampaign"),
    resumeCampaign: adminApi || isActionConfigured("resumeCampaign"),
    refreshKb: isActionConfigured("refreshKb"),
    retryFailed: true, // pure Sheets write, always available once Sheets is connected
    status: adminApi || isActionConfigured("status"),
  };
}
