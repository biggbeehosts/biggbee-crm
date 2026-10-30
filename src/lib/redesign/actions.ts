"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireWorkspaceContext } from "@/lib/auth/workspace-context";
import { requireActiveWorkspace } from "@/lib/data/workspace-store";
import { logAudit } from "@/lib/audit/log";
import { getN8nApiKey } from "@/lib/n8n/config";
import { LIVE_CONFIRM_PHRASE, buildDoneKeys } from "./core.mjs";
import { describeConfig, getRedesignConfig } from "./config";
import { scanRedesign, type RedesignScanResult } from "./service";
import { STALE_RUN_MS, createRedesignCampaign, getRedesignCampaign, mutateRedesignCampaign, type RedesignRunMode } from "./store";

export interface RedesignActionResult {
  success: boolean;
  message: string;
}

const REVALIDATE = "/website-redesign";

async function postToRedesignWebhook(url: string, payload: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getN8nApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-KEY"] = apiKey;
  }
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (res.ok) return { ok: true, message: "accepted" };
    if (res.status === 401 || res.status === 403) return { ok: false, message: "n8n rejected the request (authentication). Check N8N_API_KEY." };
    if (res.status === 404) return { ok: false, message: "The Website Redesign webhook was not found. Check N8N_WEBHOOK_REDESIGN and that the workflow is active in n8n." };
    return { ok: false, message: `n8n responded with HTTP ${res.status}.` };
  } catch {
    return { ok: false, message: "Could not reach the Website Redesign webhook." };
  }
}

export async function createRedesignCampaignAction(name: string): Promise<RedesignActionResult & { id?: string }> {
  const { email, workspaceId } = await requireWorkspaceContext();
  const parsed = z.string().trim().min(2, "Give the campaign a name.").max(80, "Name is too long.").safeParse(name);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };
  if (!getRedesignConfig(workspaceId)) return { success: false, message: "Website Redesign Outreach is not configured for this workspace." };
  const campaign = await createRedesignCampaign(workspaceId, parsed.data, email);
  await logAudit({ actor: email, action: "redesign.create", target: campaign.id, success: true, details: { workspaceId } });
  revalidatePath(REVALIDATE);
  return { success: true, message: `Created ${campaign.id}.`, id: campaign.id };
}

export async function scanRedesignAction(campaignId?: string): Promise<{ success: boolean; message: string; scan?: RedesignScanResult }> {
  const { workspaceId } = await requireWorkspaceContext();
  const config = getRedesignConfig(workspaceId);
  if (!config) return { success: false, message: "Website Redesign Outreach is not configured for this workspace." };
  if (!describeConfig(config).ready) return { success: false, message: "Finish the configuration first -- some required settings are missing." };
  const campaign = campaignId ? await getRedesignCampaign(campaignId, workspaceId) : undefined;
  if (campaignId && !campaign) return { success: false, message: "Unknown campaign." };
  const scan = await scanRedesign(config, campaign ? buildDoneKeys(Object.values(campaign.live), workspaceId, campaign.id) : undefined);
  if (campaign && scan.summary) {
    const summary = scan.summary;
    await mutateRedesignCampaign(campaign.id, workspaceId, (c) => ({ ...c, lastScan: summary }));
  }
  revalidatePath(REVALIDATE);
  return { success: true, message: scan.summary ? `Scanned ${scan.summary.discovered} row(s).` : "Scan finished with problems -- see the status panel.", scan };
}

async function startRun(campaignId: string, mode: RedesignRunMode, opts: { resume: boolean; confirmLive?: boolean; confirmText?: string }): Promise<RedesignActionResult> {
  const { email, workspaceId } = await requireWorkspaceContext();
  const config = getRedesignConfig(workspaceId);
  if (!config) return { success: false, message: "Website Redesign Outreach is not configured for this workspace." };
  const described = describeConfig(config);
  if (!described.ready || !config.webhookUrl) return { success: false, message: "Finish the configuration first -- the dedicated webhook, sheet, tracking tab, Drive folder and column mapping are all required." };

  const existing = await getRedesignCampaign(campaignId, workspaceId);
  if (!existing) return { success: false, message: "Unknown campaign." };
  if (existing.status === "running" || existing.status === "pausing") return { success: false, message: `This campaign is already ${existing.status}.` };

  if (mode === "live") {
    if (!described.liveReady) return { success: false, message: described.liveBlockers.join(" ") };
    if (!opts.confirmLive || (opts.confirmText ?? "").trim() !== LIVE_CONFIRM_PHRASE) {
      return { success: false, message: `Live sending needs explicit confirmation: tick the box and type ${LIVE_CONFIRM_PHRASE}.` };
    }
    if (!existing.dryRunCompletedAt || Object.values(existing.dry).every((r) => r.status !== "previewed")) {
      return { success: false, message: "Run and review a dry run first -- live sending only sends emails you have previewed." };
    }
    const workspace = await requireActiveWorkspace(workspaceId);
    if (!workspace.smtpCredentialRef) return { success: false, message: `Workspace "${workspace.workspaceName}" has no SMTP route configured, so it cannot send.` };
  } else {
    await requireActiveWorkspace(workspaceId);
  }

  const runId = randomUUID();
  const now = new Date().toISOString();
  try {
    await mutateRedesignCampaign(campaignId, workspaceId, (c) => {
      if (c.status === "running" || c.status === "pausing") throw new Error(`This campaign is already ${c.status}.`);
      return {
        ...c,
        status: "running",
        currentRunId: runId,
        currentMode: mode,
        runRequestedAt: now,
        beganAt: undefined,
        heartbeatAt: undefined,
        pauseReason: undefined,
        lastError: undefined,
        consecutiveErrors: 0,
        plan: undefined,
        // A fresh dry run invalidates any earlier approval until it completes again.
        ...(mode === "dry" ? { dry: {}, dryRunCompletedAt: undefined } : {}),
      };
    });
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Could not start the run." };
  }

  const trigger = await postToRedesignWebhook(config.webhookUrl, { triggeredBy: "biggbee-crm", feature: "website-redesign", campaignId, workspaceId, runId, mode, resume: opts.resume, requestedAt: now });
  if (!trigger.ok) {
    await mutateRedesignCampaign(campaignId, workspaceId, (c) => ({ ...c, status: "failed", currentRunId: undefined, lastError: trigger.message }));
    await logAudit({ actor: email, action: "redesign.start", target: campaignId, success: false, details: { mode, error: trigger.message } });
    revalidatePath(REVALIDATE);
    return { success: false, message: trigger.message };
  }
  await logAudit({ actor: email, action: "redesign.start", target: campaignId, success: true, details: { mode, resume: opts.resume, runId } });
  revalidatePath(REVALIDATE);
  return { success: true, message: mode === "dry" ? "Dry run started -- no emails will be sent." : "Live run started." };
}

export async function startRedesignDryRunAction(campaignId: string): Promise<RedesignActionResult> {
  return startRun(campaignId, "dry", { resume: false });
}

export async function startRedesignLiveRunAction(campaignId: string, confirmLive: boolean, confirmText: string): Promise<RedesignActionResult> {
  return startRun(campaignId, "live", { resume: false, confirmLive, confirmText });
}

export async function resumeRedesignRunAction(campaignId: string, confirmLive: boolean, confirmText: string): Promise<RedesignActionResult> {
  const { workspaceId } = await requireWorkspaceContext();
  const campaign = await getRedesignCampaign(campaignId, workspaceId);
  if (!campaign) return { success: false, message: "Unknown campaign." };
  if (campaign.status !== "paused" && campaign.status !== "failed") return { success: false, message: "Only a paused (or failed) campaign can be resumed." };
  const mode: RedesignRunMode = campaign.currentMode ?? "dry";
  return startRun(campaignId, mode, { resume: true, confirmLive, confirmText });
}

/** Pause is cooperative: the workflow checks the campaign state before every single send, so no
 *  further email starts once this is set. A send already in flight completes (or fails) normally. */
export async function pauseRedesignRunAction(campaignId: string): Promise<RedesignActionResult> {
  const { email, workspaceId } = await requireWorkspaceContext();
  const campaign = await getRedesignCampaign(campaignId, workspaceId);
  if (!campaign) return { success: false, message: "Unknown campaign." };
  if (campaign.status !== "running") return { success: false, message: "Only a running campaign can be paused." };
  await mutateRedesignCampaign(campaignId, workspaceId, (c) => {
    // A run that never reached n8n has nothing to wind down -- pause immediately and void its id.
    if (!c.beganAt) return { ...c, status: "paused", currentRunId: undefined, pauseReason: "Paused before the workflow started." };
    return { ...c, status: "pausing", pauseReason: "Paused by operator." };
  });
  await logAudit({ actor: email, action: "redesign.pause", target: campaignId, success: true });
  revalidatePath(REVALIDATE);
  return { success: true, message: "Pause requested -- no further emails will start." };
}

/** Escape hatch for a run whose workflow died without reporting back (heartbeat gone stale). */
export async function markRedesignRunStoppedAction(campaignId: string): Promise<RedesignActionResult> {
  const { email, workspaceId } = await requireWorkspaceContext();
  const campaign = await getRedesignCampaign(campaignId, workspaceId);
  if (!campaign) return { success: false, message: "Unknown campaign." };
  if (campaign.status !== "running" && campaign.status !== "pausing") return { success: false, message: "This campaign is not running." };
  const last = new Date(campaign.heartbeatAt ?? campaign.runRequestedAt ?? campaign.updatedAt).getTime();
  if (Date.now() - last < STALE_RUN_MS) return { success: false, message: "The run reported in recently -- use Pause instead." };
  await mutateRedesignCampaign(campaignId, workspaceId, (c) => ({ ...c, status: "paused", currentRunId: undefined, pauseReason: "Marked stopped: the workflow stopped reporting." }));
  await logAudit({ actor: email, action: "redesign.mark_stopped", target: campaignId, success: true });
  revalidatePath(REVALIDATE);
  return { success: true, message: "Marked as stopped. Businesses already marked 'sending' are never re-sent automatically -- review them in the tracking sheet." };
}
