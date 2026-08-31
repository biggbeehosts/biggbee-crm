import { NextRequest, NextResponse } from "next/server";
import { findLeadByTrackingToken } from "@/lib/data/repository";
import { getCampaign } from "@/lib/data/campaigns-store";
import { updateLeadFields } from "@/lib/data/leads-mutations";
import { recordEvent } from "@/lib/data/analytics-events-store";
import { recordOpenHit } from "@/lib/data/tracking-index-store";
import { classifyUserAgent } from "@/lib/analytics/bot-detection";
import { isTrackingRateLimited, recordTrackingHit } from "@/lib/analytics/tracking-rate-limit";
import { sha256Hex } from "@/lib/auth/crypto";

/**
 * 1x1 transparent-GIF open tracking pixel (Stage 5, Part C). This route is excluded from the auth
 * gate in src/proxy.ts (email clients have no session cookie) and MUST always return a real image
 * regardless of whether the token is valid, tracking is disabled, or recording fails -- never
 * block/break email rendering (spec: "do not block email rendering if tracking fails").
 */

// 1x1 transparent GIF (the standard "spacer.gif" bytes).
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function hashIp(req: NextRequest): string | undefined {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  return ip ? sha256Hex(ip).slice(0, 16) : undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  try {
    const { token } = await params;
    const trimmed = (token || "").replace(/\.(gif|png)$/i, "").trim();
    if (!trimmed) return pixelResponse();

    const lead = await findLeadByTrackingToken(trimmed);
    if (!lead) return pixelResponse(); // Unknown/stale token -- never error, never leak validity.

    const campaign = lead.campaignId ? await getCampaign(lead.campaignId, lead.workspaceId) : undefined;
    if (campaign && !campaign.openTrackingEnabled) return pixelResponse();

    const ipHash = hashIp(req);
    const rateLimitKey = `open:${trimmed}:${ipHash ?? "unknown"}`;
    if (isTrackingRateLimited(rateLimitKey)) return pixelResponse();
    await recordTrackingHit(rateLimitKey);

    const { category, isBot } = classifyUserAgent(req.headers.get("user-agent"));
    const at = new Date().toISOString();
    const { isFirstOpen } = await recordOpenHit(trimmed, { isBot, at });

    await recordEvent({
      workspaceId: lead.workspaceId,
      type: "open",
      leadId: lead.email,
      campaignId: lead.campaignId,
      outreachId: trimmed,
      messageId: lead.messageId ?? trimmed,
      emailHash: sha256Hex(lead.email),
      recipientDomain: lead.email.split("@")[1],
      subjectVariant: lead.subjectVariant,
      emailStyleVariant: lead.emailStyle,
      demoId: lead.demoId,
      source: "tracking-pixel",
      ipHash,
      userAgentCategory: category,
      timestamp: at,
      isUnique: isFirstOpen,
      isBotOrScanner: isBot,
      isTestEvent: false,
    });

    // Best-effort rollup write-back -- never blocks or fails the pixel response (fire-and-forget,
    // errors swallowed; Sheets being briefly unavailable must never break email rendering).
    updateLeadFields(lead.workspaceId, lead.email, {
      openCount: (lead.openCount ?? 0) + 1,
      firstOpenedAt: lead.firstOpenedAt ?? at,
      lastOpenedAt: at,
    }).catch(() => {});

    return pixelResponse();
  } catch {
    return pixelResponse();
  }
}
