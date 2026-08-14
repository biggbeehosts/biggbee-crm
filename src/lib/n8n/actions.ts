"use server";

import { revalidatePath } from "next/cache";
import { fetchAutomationStatus, triggerWebhook } from "./client";
import { fetchWorkflowStatusSafe, isAdminApiConfigured, pauseWorkflow, resumeWorkflow } from "./admin-client";
import { isActionConfigured, type N8nActionKey } from "./config";
import type { AutomationStatusResult, RunCampaignPayload, TriggerResult } from "./types";
import { getLeads, refreshAllData } from "@/lib/data/repository";
import { getCampaign } from "@/lib/data/campaigns-store";
import { bulkUpdateLeadFields, retryFailedLeads } from "@/lib/data/leads-mutations";
import { leadEligibleForCampaignRun } from "@/lib/calculations/campaign-match";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";
import { recordEvent } from "@/lib/data/analytics-events-store";

/** Which trigger actions the UI may call (status and sync go through their own paths). */
const TRIGGERABLE: N8nActionKey[] = ["runCampaign", "pauseCampaign", "resumeCampaign", "refreshKb", "retryFailed"];

/**
 * Restores every given lead's Campaign ID (and denormalized Campaign Name) to the value recorded
 * before this run claimed it -- used when a claim attempt fails partway through, or when the
 * webhook call itself never gets accepted. Groups by the exact previous (campaignId, campaignName)
 * pair so one bulk write restores every lead sharing that prior value rather than one write per
 * lead -- in practice this collapses to a single call, since every lead a run claims was Unassigned
 * beforehand (leadEligibleForCampaignRun already excludes leads claimed by another campaign, so a
 * claimed lead's only possible prior state is "unassigned"). Returns how many leads were actually
 * restored -- bulkUpdateLeadFields is itself best-effort per row, so this can be less than
 * emails.length on a genuine partial failure; that shortfall is surfaced via rolledBackCount in the
 * audit log rather than silently assumed complete (Sheets has no real transaction/rollback
 * primitive to guarantee more than this).
 */
async function restoreLeads(emails: string[], previousByEmail: Map<string, { campaignId: string; campaignName: string }>): Promise<number> {
  if (emails.length === 0) return 0;
  const groups = new Map<string, string[]>();
  for (const email of emails) {
    const prev = previousByEmail.get(email);
    if (!prev) continue;
    const key = `${prev.campaignId}\u0000${prev.campaignName}`;
    const group = groups.get(key);
    if (group) group.push(email);
    else groups.set(key, [email]);
  }
  let restored = 0;
  for (const [key, groupEmails] of groups) {
    const [prevCampaignId, prevCampaignName] = key.split("\u0000");
    const { updated } = await bulkUpdateLeadFields(groupEmails, { campaignId: prevCampaignId, campaignName: prevCampaignName });
    restored += updated.length;
  }
  return restored;
}

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

  // Run Campaign always carries an explicit, validated Campaign ID -- a missing or unknown
  // campaignId is rejected here, before n8n is ever called. n8n itself still selects leads by
  // Campaign ID = this value AND Status = New AND not previously contacted (see Prepare Leads For
  // Processing in the workflow), unchanged; the eligibility check below is what now decides,
  // ahead of time, which leads receive that Campaign ID so n8n's selection lands on them.
  let payload: Record<string, unknown> = {};
  let eligibleLeadCount = 0;
  let alreadyAssignedToCampaignCount = 0;
  let newlyClaimedCount = 0;
  let claimFailedCount = 0;
  let rolledBackCount = 0;
  // Emails this attempt actually assigned this Campaign ID to, and what each one's Campaign ID/Name
  // was immediately before -- the basis for rollback if the claim step partially fails or the
  // webhook call itself never gets accepted. Leads that already belonged to this campaign before
  // the run are never included here, so they're never rolled back either.
  let claimedEmails: string[] = [];
  const previousByEmail = new Map<string, { campaignId: string; campaignName: string }>();
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

    // Campaign targeting (Country/Industry/Business Type/Lead Generation Type/Minimum Confidence,
    // "Any"/blank = no restriction) now determines eligibility on its own -- a lead no longer has
    // to carry this Campaign ID beforehand to be picked up (see leadEligibleForCampaignRun
    // in campaign-match.ts, the single canonical rule dashboard readiness and this trigger both use).
    // n8n's own "Prepare Leads For Processing" node still selects strictly by Campaign ID, unchanged
    // -- so every matching, currently-unclaimed lead is claimed (Campaign ID assigned) here, right
    // before the webhook fires, making n8n's existing selection land on exactly the same set this
    // action (and the CRM's readiness/preview) already computed as eligible. leadEligibleForCampaignRun
    // already excludes leads claimed by a DIFFERENT campaign, so nothing below can ever overwrite
    // another campaign's lead -- every eligible lead's Campaign ID is either blank or already this
    // campaign's.
    const leads = await getLeads();
    const eligibleLeads = leads.filter((l) => leadEligibleForCampaignRun(l, campaign));
    const alreadyAssigned = eligibleLeads.filter((l) => l.campaignId === campaign.id);
    const toClaim = eligibleLeads.filter((l) => l.campaignId !== campaign.id);

    eligibleLeadCount = eligibleLeads.length;
    alreadyAssignedToCampaignCount = alreadyAssigned.length;
    for (const l of toClaim) previousByEmail.set(l.email, { campaignId: l.campaignId, campaignName: l.campaignName ?? "" });

    if (toClaim.length > 0) {
      const { updated, failed } = await bulkUpdateLeadFields(
        toClaim.map((l) => l.email),
        { campaignId: campaign.id, campaignName: campaign.name }
      );
      newlyClaimedCount = updated.length;
      claimFailedCount = failed.length;
      claimedEmails = updated;

      if (failed.length > 0) {
        // A required claim failed -- never call n8n against a partially-claimed set. Roll back
        // every lead this attempt DID successfully claim, back to its recorded previous value, and
        // report a genuine operational error (this is a real Sheets-write failure, distinct from
        // the non-error "no eligible leads" state).
        rolledBackCount = await restoreLeads(claimedEmails, previousByEmail);
        const message = `Could not assign ${failed.length} of ${toClaim.length} eligible lead${toClaim.length === 1 ? "" : "s"} to "${campaign.name}" — run cancelled${rolledBackCount > 0 ? ` and ${rolledBackCount} claim${rolledBackCount === 1 ? "" : "s"} rolled back` : ""}. Try again.`;
        await logAudit({
          actor,
          action: "n8n.runCampaign",
          success: false,
          target: campaign.id,
          details: {
            error: message,
            eligibleLeadCount,
            alreadyAssignedToCampaignCount,
            newlyClaimedCount: 0,
            claimFailedCount,
            rolledBackCount,
            webhookAccepted: false,
            claimFailures: failed,
          },
        });
        // Real writes happened (claim attempt + rollback), even though the overall action failed --
        // refresh so the UI never shows stale intermediate lead state.
        refreshAllData();
        revalidatePath("/", "layout");
        return { success: false, message };
      }
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

  if (action === "runCampaign" && !result.success && claimedEmails.length > 0) {
    // The webhook call itself failed / was never accepted -- roll back only the Campaign ID
    // assignments THIS attempt created. Leads that already belonged to this campaign before the
    // run (alreadyAssignedToCampaignCount) are never touched, since they were never added to
    // claimedEmails in the first place.
    rolledBackCount = await restoreLeads(claimedEmails, previousByEmail);
    newlyClaimedCount = 0;
    // Real writes happened (claim + rollback) even though the run itself failed -- refresh so the
    // UI never shows stale intermediate lead state.
    refreshAllData();
    revalidatePath("/", "layout");
  }

  await logAudit({
    actor,
    action: `n8n.${action}`,
    success: result.success,
    target: params.campaignId,
    details:
      action === "runCampaign"
        ? { message: result.message, payload, eligibleLeadCount, alreadyAssignedToCampaignCount, newlyClaimedCount, claimFailedCount, rolledBackCount, webhookAccepted: result.success }
        : { message: result.message, payload },
  });
  if (result.success) {
    // n8n writes results to the sheet; drop the cache so the next render shows them.
    refreshAllData();
    revalidatePath("/", "layout");
    // campaign_started is CRM-authoritative -- this webhook call is the one true trigger moment;
    // campaign_completed is emitted n8n-side (Build Run Summary -> the n8n-event webhook) once the
    // run actually finishes, since the CRM has no completion signal of its own to poll.
    if (action === "runCampaign" && params.campaignId) {
      recordEvent({
        type: "campaign_started",
        campaignId: params.campaignId,
        source: "crm",
        timestamp: new Date().toISOString(),
        isUnique: true,
        isBotOrScanner: false,
        isTestEvent: false,
      }).catch(() => {});
    }
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
