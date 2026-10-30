import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { updateCollection } from "@/lib/store/json-store";
import { decideAtomically, sweepAtomically } from "@/lib/alerts/atomic.mjs";

/**
 * Alert decision service for the "Biggbee — Error Notifier" n8n workflow.
 *
 * n8n sends each raw error payload here; the decision (new incident? duplicate? escalate? flood
 * cap?) is made inside the JSON store's per-collection queue, so simultaneous identical errors are
 * serialized and exactly one of them is told to send the email. n8n workflow static data cannot do
 * that: every execution works on a snapshot taken when it starts (see src/lib/alerts/atomic.mjs).
 *
 *   action "event" -- one error. Idempotent per eventId, so an HTTP retry returns the same answer.
 *   action "sweep" -- closes quiet incidents / flushes the flood digest; returns the emails to send.
 *
 * Auth: N8N_API_KEY via X-API-KEY or Bearer (same convention as /api/internal/n8n-event), compared
 * in constant time. Infrastructure-level data only: no leads, no workspace data is stored here.
 * Anything n8n cannot reach/parse falls back to its own local logic, so a CRM outage never silences
 * an alert.
 */

const MAX_BODY_CHARS = 100_000;

function isAuthorized(req: NextRequest): boolean {
  const expected = (process.env.N8N_API_KEY ?? "").trim();
  if (!expected) return false;
  const provided = (req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const Config = z
  .object({
    incidentGapMin: int(1, 10080),
    cooldownMin: int(1, 10080),
    flapThreshold: int(2, 1000),
    flapWindowMin: int(1, 10080),
    closeAfterMin: int(1, 10080),
    maxEmailsPerHour: int(1, 1000),
    retentionDays: int(1, 90),
    maxTrackedIncidents: int(10, 1000),
    editorBaseUrl: z.string().max(200).regex(/^https:\/\/[^\s]+$/),
  })
  .partial();

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("event"),
    payload: z.unknown(),
    ownWorkflowId: z.string().max(64).optional(),
    eventId: z.string().min(1).max(120).optional(),
    config: Config.optional(),
  }),
  z.object({ action: z.literal("sweep"), config: Config.optional() }),
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  try {
    if (body.action === "event") {
      const result = await decideAtomically(updateCollection, { payload: body.payload, ownWorkflowId: body.ownWorkflowId, eventId: body.eventId, config: body.config });
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await sweepAtomically(updateCollection, { config: body.config });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    // never leak internals; n8n treats any non-ok answer as "fall back to local logic"
    return NextResponse.json({ ok: false, error: "Alert service error" }, { status: 500 });
  }
}
