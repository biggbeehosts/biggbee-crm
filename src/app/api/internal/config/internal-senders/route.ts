import { NextRequest, NextResponse } from "next/server";
import { getInternalSenderAllowlist } from "@/lib/utils/internal-senders";

/**
 * Internal-only config endpoint (Stage 5, Part E) n8n's reply workflow fetches once per execution
 * so its internal-sender check reads the same admin-maintained list the CRM itself uses (see
 * INTERNAL_SENDER_ALLOWLIST / isInternalSender), instead of a hardcoded address baked into the
 * workflow JSON. Same X-API-KEY convention as /api/internal/n8n-event. No secrets/PII in the
 * response -- just the allowlist entries an admin already chose to configure.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = (process.env.N8N_API_KEY ?? "").trim();
  if (!expected) return false;
  const provided = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return provided.trim() === expected;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ allowlist: getInternalSenderAllowlist() });
}
