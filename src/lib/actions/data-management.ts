"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { verifyAdminPasswordAction } from "@/lib/auth/actions";
import { logAudit } from "@/lib/audit/log";
import { invalidateCache } from "@/lib/data/cache";
import { getDataMode, SHEET_TAB_NAMES } from "@/lib/data/config";
import { clearTabDataRows } from "@/lib/data/sheets-client";
import { getLeads } from "@/lib/data/repository";
import { bulkDeleteLeads } from "@/lib/data/leads-mutations";
import { getCampaigns, deleteCampaignById } from "@/lib/data/campaigns-store";
import { getScrapingJobs, deleteScrapingJob } from "@/lib/data/scraping-jobs-store";
import { getUnknownSenders } from "@/lib/data/repository";
import { deleteSenderRecord } from "@/lib/data/unknown-senders-mutations";
import { getEvents, deleteTestEvents } from "@/lib/data/analytics-events-store";
import { getErrors, getLeadMemory } from "@/lib/data/repository";
import type { ActionResult } from "./leads";

/**
 * What "test data" means across this CRM's real stores, and exactly how much of it this pass can
 * actually clean up safely -- see the doc comment on each field. Nothing here is faked: a store
 * with no `canDelete` still gets an honest count, never a delete button that doesn't work.
 */
export interface TestDataPreview {
  leads: { count: number; canDelete: true };
  campaigns: { count: number; canDelete: true };
  unknownSenders: { count: number; canDelete: true };
  scrapingJobs: { count: number; canDelete: true };
  trackingEvents: { count: number; canDelete: true };
  /** Derived from Leads (email match) -- Lead_Memory has no delete primitive in this codebase yet
   *  (it's read-only, n8n-owned). Shown for visibility; not deletable this pass. */
  leadMemory: { count: number; canDelete: false; reason: string };
  /** Derived from Leads (email match) -- Errors has no delete primitive or stable row-identity
   *  tracking in this codebase yet (it's read-only, n8n-owned). Shown for visibility; not
   *  deletable this pass. */
  errors: { count: number; canDelete: false; reason: string };
}

async function computePreview(): Promise<{
  preview: TestDataPreview;
  testLeadEmails: Set<string>;
  testCampaignIds: Set<string>;
}> {
  const [leads, campaigns, senders, jobs, memory, errors] = await Promise.all([
    getLeads(),
    getCampaigns(),
    getUnknownSenders(),
    getScrapingJobs(),
    getLeadMemory(),
    getErrors(),
  ]);
  const wideRange = { from: new Date(0).toISOString(), to: new Date().toISOString() };
  const events = await getEvents(wideRange);

  const testLeadEmails = new Set(leads.filter((l) => l.isTest).map((l) => l.email));
  const testCampaignIds = new Set(campaigns.filter((c) => c.isTest).map((c) => c.id));

  const testSenders = senders.filter((s) => testLeadEmails.has(s.fromEmail));
  const testJobs = jobs.filter((j) => testCampaignIds.has(j.campaignId));
  const testEvents = events.filter((e) => e.isTestEvent || (e.leadId ? testLeadEmails.has(e.leadId) : false));
  const testMemory = memory.filter((m) => testLeadEmails.has(m.email));
  const testErrors = errors.filter((e) => e.leadEmail && testLeadEmails.has(e.leadEmail));

  return {
    preview: {
      leads: { count: testLeadEmails.size, canDelete: true },
      campaigns: { count: testCampaignIds.size, canDelete: true },
      unknownSenders: { count: testSenders.length, canDelete: true },
      scrapingJobs: { count: testJobs.length, canDelete: true },
      trackingEvents: { count: testEvents.length, canDelete: true },
      leadMemory: { count: testMemory.length, canDelete: false, reason: "No delete function exists for Lead_Memory yet (n8n-owned, CRM read-only today)." },
      errors: { count: testErrors.length, canDelete: false, reason: "No delete function or stable row-identity tracking exists for Errors yet (n8n-owned, CRM read-only today)." },
    },
    testLeadEmails,
    testCampaignIds,
  };
}

export async function getTestDataPreviewAction(): Promise<TestDataPreview> {
  await requireAdmin();
  const { preview } = await computePreview();
  return preview;
}

export interface CleanTestDataResult extends ActionResult {
  results: Record<string, { deleted: number; failed: number }>;
  skipped: { store: string; reason: string }[];
}

/** Deletes every record this pass can safely identify as test data. Requires the exact typed
 *  phrase "DELETE TEST DATA" -- checked server-side, never trusted from a client-side flag alone.
 *  Best-effort per store: one store failing doesn't abort the others, and every outcome (not just
 *  successes) is in the returned summary. Production records are never touched -- every deletion
 *  here is scoped to rows already identified as isTest=true (Leads/Campaigns) or derived from a
 *  test lead's email (everything else). */
export async function cleanTestDataAction(confirmPhrase: string): Promise<CleanTestDataResult> {
  const actor = await requireAdmin();
  if (confirmPhrase !== "DELETE TEST DATA") {
    return { success: false, message: 'Type "DELETE TEST DATA" exactly to confirm.', results: {}, skipped: [] };
  }

  const { preview, testLeadEmails, testCampaignIds } = await computePreview();
  const results: Record<string, { deleted: number; failed: number }> = {};

  // Leads
  const { deleted: deletedLeads, failed: failedLeads } = await bulkDeleteLeads(Array.from(testLeadEmails));
  results.leads = { deleted: deletedLeads.length, failed: failedLeads.length };

  // Campaigns
  let campaignDeleted = 0;
  let campaignFailed = 0;
  for (const id of testCampaignIds) {
    try {
      await deleteCampaignById(id);
      campaignDeleted++;
    } catch {
      campaignFailed++;
    }
  }
  results.campaigns = { deleted: campaignDeleted, failed: campaignFailed };

  // Unknown Senders
  const senders = await getUnknownSenders();
  let senderDeleted = 0;
  let senderFailed = 0;
  for (const s of senders.filter((s) => testLeadEmails.has(s.fromEmail))) {
    try {
      await deleteSenderRecord(s.fromEmail, s.timestamp);
      senderDeleted++;
    } catch {
      senderFailed++;
    }
  }
  results.unknownSenders = { deleted: senderDeleted, failed: senderFailed };

  // Scraping Jobs
  const jobs = await getScrapingJobs();
  let jobDeleted = 0;
  let jobFailed = 0;
  for (const j of jobs.filter((j) => testCampaignIds.has(j.campaignId))) {
    try {
      await deleteScrapingJob(j.id);
      jobDeleted++;
    } catch {
      jobFailed++;
    }
  }
  results.scrapingJobs = { deleted: jobDeleted, failed: jobFailed };

  // Tracking events -- test-flagged events live in monthly shards; delete-by-month across every
  // shard that actually has test events, same primitive Tracking's existing admin UI already uses.
  const wideRange = { from: new Date(0).toISOString(), to: new Date().toISOString() };
  const events = await getEvents(wideRange);
  const testMonths = new Set(
    events.filter((e) => e.isTestEvent || (e.leadId ? testLeadEmails.has(e.leadId) : false)).map((e) => e.timestamp.slice(0, 7))
  );
  let eventsDeleted = 0;
  for (const month of testMonths) {
    eventsDeleted += await deleteTestEvents(`analytics-events-${month}`);
  }
  results.trackingEvents = { deleted: eventsDeleted, failed: 0 };

  invalidateCache();
  revalidatePath("/", "layout");

  const skipped = [
    { store: "Lead Memory", reason: preview.leadMemory.reason },
    { store: "Errors", reason: preview.errors.reason },
  ];

  const totalDeleted = Object.values(results).reduce((s, r) => s + r.deleted, 0);
  const totalFailed = Object.values(results).reduce((s, r) => s + r.failed, 0);

  await logAudit({
    actor,
    action: "data_management.clean_test_data",
    success: totalFailed === 0,
    details: { results, skipped: skipped.map((s) => s.store) },
  });

  return {
    success: totalFailed === 0,
    message: `Deleted ${totalDeleted} test record${totalDeleted === 1 ? "" : "s"}${totalFailed > 0 ? ` (${totalFailed} failed)` : ""}.`,
    results,
    skipped,
  };
}

const RESET_TABS = [
  { key: "leads" as const, label: "Leads" },
  { key: "leadMemory" as const, label: "Lead Memory" },
  { key: "campaigns" as const, label: "Campaigns" },
  { key: "scrapingJobs" as const, label: "Scraping Jobs" },
  { key: "unknownSenders" as const, label: "Unknown Senders" },
  { key: "errors" as const, label: "Errors" },
];

export interface ResetCrmDataResult extends ActionResult {
  results: Record<string, number>;
}

/**
 * The dangerous operation: clears the DATA rows (never the header row, never the tab, never any
 * other tab) of every CRM-generated/business-data tab. Requires, in order: an active admin
 * session (requireAdmin), a fresh password re-verification (verifyAdminPasswordAction -- the same
 * check login itself uses, never a weaker one), the exact typed phrase "RESET BIGGBEE", and an
 * explicit `finalConfirm: true` second-stage flag from the UI's second dialog. Every check is
 * server-side; a client that only sends `finalConfirm: true` without a valid password and phrase
 * is rejected before anything is touched.
 *
 * Explicitly preserved (never touched by this function): admin account, session/auth config, all
 * environment secrets (Google/n8n/Cloudinary/SMTP/webhook), Website Registry, Demo Library,
 * Knowledge Base cache, scraper-agent definitions (local JSON, not a sheet tab this function ever
 * calls), n8n workflows, and the audit log itself (so the reset's own record survives it).
 */
export async function resetCrmDataAction(password: string, confirmPhrase: string, finalConfirm: boolean): Promise<ResetCrmDataResult> {
  const actor = await requireAdmin();

  if (confirmPhrase !== "RESET BIGGBEE") {
    return { success: false, message: 'Type "RESET BIGGBEE" exactly to confirm.', results: {} };
  }
  if (!finalConfirm) {
    return { success: false, message: "Final confirmation was not received.", results: {} };
  }
  const verified = await verifyAdminPasswordAction(password);
  if (!verified.success) {
    await logAudit({ actor, action: "data_management.reset_denied", success: false, details: { reason: "password_verification_failed" } });
    return { success: false, message: verified.message, results: {} };
  }

  if (getDataMode() === "mock") {
    return {
      success: false,
      message: "Reset only applies in Google Sheets mode -- mock data is session-only and already resets on server restart.",
      results: {},
    };
  }

  const results: Record<string, number> = {};
  for (const tab of RESET_TABS) {
    try {
      results[tab.label] = await clearTabDataRows(SHEET_TAB_NAMES[tab.key]);
    } catch (err) {
      await logAudit({
        actor,
        action: "data_management.reset_partial_failure",
        success: false,
        details: { tab: tab.label, error: err instanceof Error ? err.message : String(err) },
      });
      results[tab.label] = -1; // -1 signals "failed", never a fabricated count
    }
  }

  invalidateCache();
  revalidatePath("/", "layout");

  await logAudit({
    actor,
    action: "data_management.reset_crm_data",
    success: Object.values(results).every((v) => v >= 0),
    details: { results },
  });

  return {
    success: Object.values(results).every((v) => v >= 0),
    message: "CRM data reset complete. Configuration, credentials, and integrations were not touched.",
    results,
  };
}
