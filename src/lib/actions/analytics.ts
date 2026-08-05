"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAudit } from "@/lib/audit/log";
import { getEvents, markEventsAsTest, deleteTestEvents, purgeEventsOlderThan, shardKeyForTimestamp } from "@/lib/data/analytics-events-store";
import { getTrackingSettings, setRetentionDays } from "@/lib/data/tracking-settings-store";
import { addAllowlistEntry, removeAllowlistEntry } from "@/lib/data/internal-senders-store";
import { computeTrackingSnapshot, type TrackingFilter } from "@/lib/calculations/tracking-metrics";
import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getInboxPlacementTests } from "@/lib/data/deliverability-store";
import type { ActionResult } from "./leads";

/** Shown instead of a number for any metric SMTP sending structurally cannot confirm -- see
 *  campaign-analytics-card.tsx's doc comment (Stage 5 completion, Priority 6). */
const UNAVAILABLE = "Unavailable until provider integration";

/** Part N: "mark events as test" -- groups the selected ids by month shard (each event carries its
 *  own timestamp from the already-fetched admin table) since the underlying store keys by shard. */
export async function markEventsAsTestAction(events: { id: string; timestamp: string }[]): Promise<ActionResult> {
  const actor = await requireAdmin();
  const byMonth = new Map<string, string[]>();
  for (const e of events) {
    const month = shardKeyForTimestamp(e.timestamp);
    byMonth.set(month, [...(byMonth.get(month) ?? []), e.id]);
  }
  let total = 0;
  for (const [month, ids] of byMonth) {
    total += await markEventsAsTest(ids, month);
  }
  await logAudit({ actor, action: "analytics.events_marked_test", success: true, details: { count: total } });
  revalidatePath("/system/tracking");
  return { success: true, message: `${total} event${total === 1 ? "" : "s"} marked as test.` };
}

/** Deletes every test event within one month shard -- matches deleteTestEvents' existing
 *  per-shard shape rather than inventing per-id delete (test data is meant to be cleared in bulk,
 *  not surgically). */
export async function deleteTestEventsForMonthAction(monthHint: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const removed = await deleteTestEvents(monthHint);
  await logAudit({ actor, action: "analytics.test_events_deleted", target: monthHint, success: true, details: { removed } });
  revalidatePath("/system/tracking");
  return { success: true, message: `${removed} test event${removed === 1 ? "" : "s"} deleted from ${monthHint}.` };
}

const RetentionSchema = z.object({ retentionDays: z.coerce.number().min(30).max(3650) });

export async function updateRetentionDaysAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsed = RetentionSchema.safeParse({ retentionDays: formData.get("retentionDays") });
  if (!parsed.success) return { success: false, message: "Retention must be between 30 and 3650 days." };
  const settings = await setRetentionDays(parsed.data.retentionDays);
  await logAudit({ actor, action: "analytics.retention_updated", success: true, details: { retentionDays: settings.retentionDays } });
  revalidatePath("/system/tracking");
  return { success: true, message: `Retention set to ${settings.retentionDays} days.` };
}

export async function purgeOldTrackingEventsAction(): Promise<ActionResult> {
  const actor = await requireAdmin();
  const { retentionDays } = getTrackingSettings();
  const removed = await purgeEventsOlderThan(retentionDays);
  await logAudit({ actor, action: "analytics.events_purged", success: true, details: { retentionDays, removed } });
  revalidatePath("/system/tracking");
  return { success: true, message: `${removed} event${removed === 1 ? "" : "s"} older than ${retentionDays} days purged.` };
}

export async function addInternalSenderAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const entry = String(formData.get("entry") || "").trim();
  if (!entry) return { success: false, message: "Enter an email or @domain." };
  const list = await addAllowlistEntry(entry);
  await logAudit({ actor, action: "analytics.internal_sender_added", target: entry, success: true, details: { count: list.length } });
  revalidatePath("/system/tracking");
  return { success: true, message: "Internal sender added." };
}

export async function removeInternalSenderAction(entry: string): Promise<ActionResult> {
  const actor = await requireAdmin();
  const list = await removeAllowlistEntry(entry);
  await logAudit({ actor, action: "analytics.internal_sender_removed", target: entry, success: true, details: { count: list.length } });
  revalidatePath("/system/tracking");
  return { success: true, message: "Internal sender removed." };
}

/** Part N: "export campaign analytics" -- plain CSV, no library, matching this app's no-heavy-deps
 *  convention. Recomputes the same aggregation the campaign card shows, all-time for one campaign. */
export async function exportCampaignAnalyticsCsvAction(campaignId: string): Promise<{ success: boolean; csv?: string; message?: string }> {
  await requireAdmin();
  const [leads, campaigns, placementTests] = await Promise.all([getLeads(), getCampaigns(), getInboxPlacementTests()]);
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) return { success: false, message: "Unknown campaign." };

  const from = "2020-01-01T00:00:00.000Z";
  const to = new Date().toISOString();
  const events = await getEvents({ from, campaignId });
  const filter: TrackingFilter = { from, to, campaignId };
  const snapshot = computeTrackingSnapshot(filter, leads, campaigns, events, placementTests);

  const rows: [string, string | number][] = [
    ["Campaign", campaign.name],
    ["Leads scraped", snapshot.kpis.leadsScraped],
    ["Leads approved", snapshot.kpis.approvedLeads],
    ["Emails attempted", snapshot.kpis.emailsAttempted],
    ["Emails sent", snapshot.kpis.emailsSent],
    ["Delivered", snapshot.kpis.confirmedDelivered > 0 ? snapshot.kpis.confirmedDelivered : UNAVAILABLE],
    ["Estimated unique opens", snapshot.kpis.estimatedUniqueOpens],
    ["Unique clicks", snapshot.kpis.uniqueClicks],
    ["Replies", snapshot.kpis.replies],
    ["Positive replies", snapshot.kpis.positiveReplies],
    ["Meetings", snapshot.kpis.meetings],
    ["Demos sent", snapshot.kpis.demosSent],
    ["Hard bounces", snapshot.kpis.hardBounces],
    ["Soft bounces", snapshot.kpis.softBounces],
    ["Deferred", snapshot.kpis.deferred],
    ["Complaints", snapshot.kpis.complaints],
    ["Unsubscribes", snapshot.kpis.unsubscribes],
    ["Estimated inbox placement rate", snapshot.kpis.inboxPlacementRate === null ? UNAVAILABLE : snapshot.kpis.inboxPlacementRate],
    ["Estimated spam placement rate", snapshot.kpis.spamPlacementRate === null ? UNAVAILABLE : snapshot.kpis.spamPlacementRate],
    ["Last activity", snapshot.lastActivityAt ?? ""],
  ];
  const csv = ["Metric,Value", ...rows.map(([label, value]) => `"${label}","${String(value).replace(/"/g, '""')}"`)].join("\n");
  return { success: true, csv };
}
