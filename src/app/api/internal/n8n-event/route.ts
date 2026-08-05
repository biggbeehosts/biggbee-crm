import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ANALYTICS_EVENT_TYPES } from "@/types";
import { recordEvent } from "@/lib/data/analytics-events-store";
import { updateLeadFields } from "@/lib/data/leads-mutations";
import { getCampaign } from "@/lib/data/campaigns-store";
import { sha256Hex } from "@/lib/auth/crypto";
import { logAudit } from "@/lib/audit/log";

/** Reply-analytics event types gated by the per-campaign Reply Tracking Enabled toggle. Bounce,
 *  unsubscribe, and complaint types are never gated here -- those are compliance/suppression
 *  signals, not engagement analytics, and must always be recorded regardless of the toggle. */
const REPLY_TRACKING_GATED_TYPES = new Set(["reply_received", "positive_reply", "negative_reply", "meeting_booked"]);

/** Campaign-level event types that have no associated lead/recipient. */
const CAMPAIGN_LEVEL_TYPES = new Set(["campaign_completed"]);

/**
 * Internal-only endpoint n8n's reply/bounce path pushes events to (Stage 5, Part E/F) -- the one
 * place n8n calls the CRM rather than the CRM reading Sheets, since a reply is classified/a bounce
 * is parsed exactly once and there's no polling alternative that wouldn't need the CRM to re-diff
 * the Leads sheet on a timer. Never reachable from a browser: same X-API-KEY convention already
 * used for CRM->n8n webhook calls (src/lib/n8n/client.ts), validated here in the other direction.
 * Suppression itself does NOT depend on this endpoint succeeding -- n8n writes Status directly to
 * the Leads sheet in the same reply-path branch, so sending stays correctly gated even if the CRM
 * is briefly unreachable when this fires. This endpoint only records the analytics event (and a
 * best-effort denormalized rollup field) for dashboards/timelines.
 */

const EVENT_TYPES_ACCEPTED = [
  "reply_received",
  "positive_reply",
  "negative_reply",
  "meeting_booked",
  "unsubscribe",
  "complaint",
  "hard_bounce",
  "soft_bounce",
  "deferred",
  "send_attempted",
  "sent",
  "delivery_confirmed",
  "delivery_failed",
  "demo_attached",
  "demo_sent",
  "campaign_completed",
] as const;

const BodySchema = z.object({
  type: z.enum(EVENT_TYPES_ACCEPTED),
  /** Optional only for campaign-level types (currently just campaign_completed) -- every
   *  lead-scoped type is still required to carry a real recipient, enforced below. */
  leadEmail: z.string().email().optional(),
  campaignId: z.string().optional(),
  n8nExecutionId: z.string().optional(),
  /** Present on send-side events (send_attempted, sent, delivery_confirmed, delivery_failed,
   *  demo_attached, demo_sent) -- the same opaque per-send token stored on the lead as
   *  messageId/trackingToken. */
  outreachId: z.string().optional(),
  subjectVariant: z.string().optional(),
  emailStyleVariant: z.string().optional(),
  demoId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function isAuthorized(req: NextRequest): boolean {
  const expected = (process.env.N8N_API_KEY ?? "").trim();
  if (!expected) return false;
  const provided = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return provided.trim() === expected;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event payload", details: parsed.error.issues }, { status: 400 });
  }
  const { type, leadEmail, campaignId, n8nExecutionId, outreachId, subjectVariant, emailStyleVariant, demoId, metadata } = parsed.data;
  if (!ANALYTICS_EVENT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
  }

  if (!CAMPAIGN_LEVEL_TYPES.has(type) && !leadEmail) {
    return NextResponse.json({ error: "leadEmail is required for this event type" }, { status: 400 });
  }

  // Reply engagement analytics honor the per-campaign toggle -- suppression/reply detection in
  // n8n itself is unaffected (see file doc comment), this only skips the *recorded event*.
  if (REPLY_TRACKING_GATED_TYPES.has(type) && campaignId) {
    const campaign = await getCampaign(campaignId);
    if (campaign && !campaign.replyTrackingEnabled) {
      return NextResponse.json({ ok: true, skipped: "reply-tracking-disabled" });
    }
  }

  const email = leadEmail ? leadEmail.trim().toLowerCase() : undefined;
  const at = new Date().toISOString();

  await recordEvent({
    type,
    leadId: email,
    campaignId,
    outreachId,
    messageId: outreachId,
    subjectVariant,
    emailStyleVariant,
    demoId,
    emailHash: email ? sha256Hex(email) : undefined,
    recipientDomain: email ? email.split("@")[1] : undefined,
    n8nExecutionId,
    source: "n8n",
    timestamp: at,
    metadata,
    isUnique: true,
    isBotOrScanner: false,
    isTestEvent: false,
  });

  // Best-effort denormalized rollup -- never blocks the response; the Sheet's Status column
  // (written directly by n8n in the same reply-path branch, or by the same "Log Email
  // Sent"/"Log Email Failed" nodes for send outcomes) is the real gate, not this webhook.
  if (email) {
    if (type === "sent" && n8nExecutionId) {
      updateLeadFields(email, { n8nExecutionId }).catch(() => {});
    } else if (type === "hard_bounce") {
      updateLeadFields(email, { bounceType: "Hard", bouncedAt: at, suppressedReason: "Hard bounce" }).catch(() => {});
      logAudit({ actor: "system", action: "lead.suppressed", target: email, success: true, details: { reason: "Hard bounce", campaignId, n8nExecutionId } }).catch(() => {});
    } else if (type === "soft_bounce") {
      updateLeadFields(email, { bounceType: "Soft" }).catch(() => {});
    } else if (type === "deferred") {
      // Temporary/greylist DSN -- not suppressed, just recorded for visibility (see
      // Match Sender to Lead's DEFERRED_PATTERNS, split out from soft-bounce patterns).
      updateLeadFields(email, { bounceType: "Deferred", bouncedAt: at }).catch(() => {});
    } else if (type === "complaint") {
      updateLeadFields(email, { complaintAt: at, suppressedReason: "Complaint" }).catch(() => {});
      logAudit({ actor: "system", action: "lead.suppressed", target: email, success: true, details: { reason: "Complaint", campaignId, n8nExecutionId } }).catch(() => {});
    } else if (type === "unsubscribe") {
      updateLeadFields(email, { suppressedReason: "Unsubscribed" }).catch(() => {});
      logAudit({ actor: "system", action: "lead.suppressed", target: email, success: true, details: { reason: "Unsubscribed", campaignId, n8nExecutionId } }).catch(() => {});
    } else if (type === "demo_sent") {
      updateLeadFields(email, { demoSent: true, demoSentAt: at }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
