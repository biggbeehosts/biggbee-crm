import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/data/repository";
import { getCampaign } from "@/lib/data/campaigns-store";
import { updateLeadFields } from "@/lib/data/leads-mutations";
import { recordEvent } from "@/lib/data/analytics-events-store";
import { recordClickHit } from "@/lib/data/tracking-index-store";
import { classifyUserAgent } from "@/lib/analytics/bot-detection";
import { isTrackingRateLimited, recordTrackingHit } from "@/lib/analytics/tracking-rate-limit";
import { sha256Hex } from "@/lib/auth/crypto";

/**
 * Signed-by-allowlist click redirect (Stage 5, Part D/K). The destination travels in `?u=` as a
 * base64url-encoded URL -- rather than trust that n8n only ever emitted a safe one (n8n's Code
 * node sandbox can't sign it, see the Stage 5 plan's architecture notes), this endpoint validates
 * scheme + host against a strict allowlist on EVERY request, independent of what generated the
 * link. Anything that fails validation, or an unknown token, redirects to a fixed safe fallback --
 * never to attacker-controlled input, and never a visible error page a recipient could be
 * confused/phished by.
 */

const SAFE_FALLBACK = "https://biggbees.com";

function allowedHosts(): string[] {
  const raw = process.env.TRACKING_ALLOWED_LINK_HOSTS || "res.cloudinary.com,biggbees.com,www.biggbees.com";
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function decodeDestination(encoded: string | null): URL | null {
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
    const url = new URL(decoded);
    if (url.protocol !== "https:") return null;
    if (!allowedHosts().includes(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

function hashIp(req: NextRequest): string | undefined {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  return ip ? sha256Hex(ip).slice(0, 16) : undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await params;
  const trimmed = (token || "").trim();
  const destination = decodeDestination(req.nextUrl.searchParams.get("u"));
  const linkLabel = req.nextUrl.searchParams.get("l") || "unknown";

  // Invalid/unsafe destination -- redirect to the fixed fallback regardless of token validity,
  // never render an error and never redirect to whatever the caller supplied.
  if (!destination) return NextResponse.redirect(SAFE_FALLBACK, { status: 302 });

  try {
    if (!trimmed) return NextResponse.redirect(destination.toString(), { status: 302 });

    const leads = await getLeads();
    const lead = leads.find((l) => l.trackingToken === trimmed);
    if (!lead) return NextResponse.redirect(destination.toString(), { status: 302 });

    const campaign = lead.campaignId ? await getCampaign(lead.campaignId) : undefined;
    if (campaign && !campaign.clickTrackingEnabled) return NextResponse.redirect(destination.toString(), { status: 302 });

    const ipHash = hashIp(req);
    const rateLimitKey = `click:${trimmed}:${ipHash ?? "unknown"}`;
    if (isTrackingRateLimited(rateLimitKey)) return NextResponse.redirect(destination.toString(), { status: 302 });
    await recordTrackingHit(rateLimitKey);

    const { category, isBot } = classifyUserAgent(req.headers.get("user-agent"));
    const at = new Date().toISOString();
    const { isFirstClick } = await recordClickHit(trimmed, { isBot, at });

    await recordEvent({
      type: "click",
      leadId: lead.email,
      campaignId: lead.campaignId,
      outreachId: trimmed,
      messageId: lead.messageId ?? trimmed,
      emailHash: sha256Hex(lead.email),
      recipientDomain: lead.email.split("@")[1],
      subjectVariant: lead.subjectVariant,
      emailStyleVariant: lead.emailStyle,
      demoId: lead.demoId,
      source: "click-redirect",
      ipHash,
      userAgentCategory: category,
      timestamp: at,
      metadata: { link: linkLabel },
      isUnique: isFirstClick,
      isBotOrScanner: isBot,
      isTestEvent: false,
    });

    updateLeadFields(lead.email, {
      clickCount: (lead.clickCount ?? 0) + 1,
      firstClickedAt: lead.firstClickedAt ?? at,
      lastClickedAt: at,
    }).catch(() => {});

    return NextResponse.redirect(destination.toString(), { status: 302 });
  } catch {
    return NextResponse.redirect(destination.toString(), { status: 302 });
  }
}
