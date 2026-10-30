import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireActiveWorkspace } from "@/lib/data/workspace-store";
import { describeConfig, getRedesignConfig } from "@/lib/redesign/config";
import { buildSuppressedEmails, getSafetySignals } from "@/lib/redesign/service";
import { getRedesignCampaign, mutateRedesignCampaign, type RedesignBusinessResult, type RedesignCampaign } from "@/lib/redesign/store";
import { logAudit } from "@/lib/audit/log";

/**
 * Callback endpoint for the dedicated "Biggbee AI -- Website Redesign Outreach" n8n workflow.
 * It is the authority for a run: n8n cannot start work the CRM did not request, because every
 * call must present the single-use runId the CRM issued for this exact campaign + workspace.
 *
 *   begin  -- first call of a run. Validates workspace, campaign ownership, config and (for live)
 *             the dry-run + confirmation gates, burns the runId (a duplicate webhook is refused),
 *             and returns the non-secret run configuration.
 *   check  -- called before EVERY send: heartbeat + live pause/stop state + safety signals.
 *   report -- plan / per-business result / pause / complete.
 *
 * Auth: same convention as /api/internal/n8n-event (N8N_API_KEY via X-API-KEY or Bearer),
 * compared in constant time. Never reachable from a browser session. No secret is ever returned.
 */

function isAuthorized(req: NextRequest): boolean {
  const expected = (process.env.N8N_API_KEY ?? "").trim();
  if (!expected) return false;
  const provided = (req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const Base = z.object({ campaignId: z.string().min(1).max(40), workspaceId: z.string().min(1).max(80), runId: z.string().min(8).max(80) });

const BusinessResult = z.object({
  businessKey: z.string().min(1).max(200),
  businessName: z.string().max(200).default(""),
  email: z.string().max(254).default(""),
  status: z.enum(["previewed", "blocked", "queued", "sending", "sent", "failed", "skipped"]),
  reason: z.string().max(600).optional(),
  subject: z.string().max(200).optional(),
  bodyText: z.string().max(6000).optional(),
  attachmentNames: z.array(z.string().max(200)).max(20).optional(),
  attachmentFingerprint: z.string().max(2000).optional(),
  usedFallback: z.boolean().optional(),
  failureKind: z.string().max(40).optional(),
});

const Body = z.discriminatedUnion("action", [
  Base.extend({ action: z.literal("begin") }),
  Base.extend({ action: z.literal("check") }),
  Base.extend({
    action: z.literal("report"),
    event: z.discriminatedUnion("type", [
      z.object({ type: z.literal("plan"), discovered: z.number().int().min(0), eligible: z.number().int().min(0), matched: z.number().int().min(0), blocked: z.number().int().min(0), toProcess: z.number().int().min(0) }),
      z.object({ type: z.literal("business"), result: BusinessResult }),
      z.object({ type: z.literal("pause"), reason: z.string().max(600) }),
      z.object({ type: z.literal("complete") }),
    ]),
  }),
]);

function reject(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/** The run is valid only if the campaign belongs to this workspace AND this is its current run. */
function runMatches(c: RedesignCampaign | undefined, runId: string): c is RedesignCampaign {
  return !!c && !!c.currentRunId && c.currentRunId === runId;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reject(400, "Invalid JSON body");
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return reject(400, "Invalid payload");
  const body = parsed.data;
  const { campaignId, workspaceId, runId } = body;

  const campaign = await getRedesignCampaign(campaignId, workspaceId);

  if (body.action === "check" && !runMatches(campaign, runId)) {
    // A stale/duplicate/cancelled run is told to stop rather than treated as an error.
    return NextResponse.json({ ok: true, status: "cancelled", reason: "This run is no longer current." });
  }
  if (!runMatches(campaign, runId)) return reject(409, "Unknown or superseded run.");

  const config = getRedesignConfig(workspaceId);
  if (!config) return reject(403, "Website Redesign Outreach is not configured for this workspace.");

  if (body.action === "begin") {
    let workspace;
    try {
      workspace = await requireActiveWorkspace(workspaceId);
    } catch {
      return reject(403, "Workspace is unknown or inactive.");
    }
    const described = describeConfig(config);
    if (!described.ready) return reject(412, "Redesign configuration is incomplete.");
    if (campaign.status !== "running") return reject(409, `Campaign is ${campaign.status}.`);
    if (campaign.beganAt) return reject(409, "This run has already begun (duplicate webhook delivery).");
    const mode = campaign.currentMode ?? "dry";
    if (mode === "live") {
      if (!described.liveReady) return reject(412, described.liveBlockers.join(" "));
      if (!campaign.dryRunCompletedAt) return reject(412, "No completed dry run to send from.");
      if (!workspace.smtpCredentialRef) return reject(412, "Workspace has no SMTP route configured.");
    }
    const now = new Date().toISOString();
    try {
      await mutateRedesignCampaign(campaignId, workspaceId, (c) => {
        if (c.currentRunId !== runId || c.beganAt) throw new Error("run already began");
        return { ...c, beganAt: now, heartbeatAt: now };
      });
    } catch {
      return reject(409, "This run has already begun (duplicate webhook delivery).");
    }
    const [suppressed, signals] = await Promise.all([buildSuppressedEmails(workspaceId), getSafetySignals(workspaceId)]);
    // Only non-secret configuration. smtpCredentialRef and the API key are never returned.
    return NextResponse.json({
      ok: true,
      mode,
      campaignId,
      workspaceId,
      runId,
      workspace: {
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        senderDisplayName: workspace.senderDisplayName,
        senderEmail: workspace.senderEmail,
        replyToEmail: workspace.replyToEmail,
        website: workspace.website,
        signatureName: workspace.signatureName,
        signatureWebsite: workspace.signatureWebsite,
      },
      sheet: { id: config.sheetId, leadsTab: config.leadsTab, trackingTab: config.trackingTab },
      driveFolderId: config.driveFolderId,
      columnMap: config.columnMap,
      eligibleStatuses: config.eligibleStatuses,
      settings: config.settings,
      suppressedEmails: suppressed,
      signals,
    });
  }

  if (body.action === "check") {
    const now = new Date().toISOString();
    const updated = await mutateRedesignCampaign(campaignId, workspaceId, (c) => ({ ...c, heartbeatAt: now }));
    const signals = await getSafetySignals(workspaceId);
    return NextResponse.json({ ok: true, status: updated.status === "running" ? "running" : updated.status, consecutiveErrors: updated.consecutiveErrors, ...signals });
  }

  // report
  const event = body.event;
  const now = new Date().toISOString();
  if (event.type === "plan") {
    await mutateRedesignCampaign(campaignId, workspaceId, (c) => ({ ...c, heartbeatAt: now, plan: { discovered: event.discovered, eligible: event.eligible, matched: event.matched, blocked: event.blocked, toProcess: event.toProcess } }));
  } else if (event.type === "business") {
    const r = event.result;
    await mutateRedesignCampaign(campaignId, workspaceId, (c) => {
      const mode = c.currentMode ?? "dry";
      const entry: RedesignBusinessResult = { ...r, updatedAt: now };
      const target = mode === "live" ? { ...c.live } : { ...c.dry };
      target[r.businessKey] = entry;
      const next: RedesignCampaign = { ...c, heartbeatAt: now, ...(mode === "live" ? { live: target } : { dry: target }) };
      if (mode === "live" && r.status === "sent") {
        next.liveSendLog = [...c.liveSendLog, now].slice(-5000);
        next.consecutiveErrors = 0;
      } else if (mode === "live" && r.status === "failed") {
        next.consecutiveErrors = c.consecutiveErrors + 1;
      }
      return next;
    });
  } else if (event.type === "pause") {
    await mutateRedesignCampaign(campaignId, workspaceId, (c) => ({ ...c, status: "paused", pauseReason: event.reason, heartbeatAt: now }));
    await logAudit({ actor: "n8n:redesign", action: "redesign.auto_pause", target: campaignId, success: true, details: { reason: event.reason, workspaceId } });
  } else {
    await mutateRedesignCampaign(campaignId, workspaceId, (c) => {
      // A run that already paused itself (or was stopped) must not be flipped to "completed".
      if (c.status !== "running" && c.status !== "pausing") return c;
      const wasPausing = c.status === "pausing";
      return {
        ...c,
        status: wasPausing ? "paused" : "completed",
        heartbeatAt: now,
        currentRunId: wasPausing ? c.currentRunId : undefined,
        // Only a finished DRY run unlocks live sending.
        ...(c.currentMode === "dry" && !wasPausing ? { dryRunCompletedAt: now } : {}),
      };
    });
  }
  return NextResponse.json({ ok: true });
}
