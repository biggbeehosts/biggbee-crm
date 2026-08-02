"use server";

import { revalidatePath } from "next/cache";
import { fetchAutomationStatus, triggerWebhook } from "./client";
import { isActionConfigured, type N8nActionKey } from "./config";
import type { AutomationStatusResult, TriggerResult } from "./types";
import { refreshAllData } from "@/lib/data/repository";

/** Which trigger actions the UI may call (status and sync go through their own paths). */
const TRIGGERABLE: N8nActionKey[] = ["runCampaign", "pauseCampaign", "resumeCampaign", "refreshKb", "retryFailed"];

export async function triggerN8nAction(action: N8nActionKey): Promise<TriggerResult> {
  if (!TRIGGERABLE.includes(action)) {
    return { success: false, message: "Unknown automation action." };
  }
  const result = await triggerWebhook(action);
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
  return {
    runCampaign: isActionConfigured("runCampaign"),
    pauseCampaign: isActionConfigured("pauseCampaign"),
    resumeCampaign: isActionConfigured("resumeCampaign"),
    refreshKb: isActionConfigured("refreshKb"),
    retryFailed: isActionConfigured("retryFailed"),
    status: isActionConfigured("status"),
  };
}
