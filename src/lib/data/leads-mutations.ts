import "server-only";
import type { Lead, LeadStatus } from "@/types";
import { getDataMode, SHEET_TAB_NAMES } from "./config";
import { appendRow, ensureTabWithHeaders, fetchSheetRows, rowsToObjects, tabExists, updateRowFields, deleteSheetRow } from "./sheets-client";
import { normalizeLead } from "./normalize";
import { addMockLead, deleteMockLead, updateMockLead } from "./mock-store";
import { invalidateCache } from "./cache";

/**
 * Adds the "Campaign ID" column to the live Leads tab if it's missing, as a new trailing column
 * -- never reorders or touches any existing column. Guarded to only run against a tab that
 * already exists: the Leads tab is owned and created by the n8n workflow, never by the CRM, so
 * this must never accidentally create it from scratch.
 */
let leadsCampaignColumnEnsured = false;
async function ensureLeadsCampaignIdColumn(): Promise<void> {
  if (leadsCampaignColumnEnsured) return;
  if (await tabExists(SHEET_TAB_NAMES.leads)) {
    await ensureTabWithHeaders(SHEET_TAB_NAMES.leads, ["Campaign ID"]);
  }
  leadsCampaignColumnEnsured = true;
}

/** Same additive-column pattern as ensureLeadsCampaignIdColumn, for the Change-2 scraper columns
 *  (Lead ID, Campaign Name, Location, Target Service, Source, Scraper Job ID, Created At). The
 *  n8n scraper workflows add these themselves on first write too -- this covers the CRM's own
 *  read/edit paths so a fresh Leads tab that hasn't been scraped into yet still has them. */
const SCRAPER_LEAD_HEADERS = ["Lead ID", "Campaign Name", "Location", "Target Service", "Source", "Scraper Job ID", "Created At"];
let leadsScraperColumnsEnsured = false;
async function ensureLeadsScraperColumns(): Promise<void> {
  if (leadsScraperColumnsEnsured) return;
  if (await tabExists(SHEET_TAB_NAMES.leads)) {
    await ensureTabWithHeaders(SHEET_TAB_NAMES.leads, SCRAPER_LEAD_HEADERS);
  }
  leadsScraperColumnsEnsured = true;
}

/** Same additive-column pattern, for the Change-3 demo tracking columns (Demo ID, Demo Sent,
 *  Demo Sent At, Demo Match Reason). n8n's "Log Email Sent" node writes these itself on the
 *  actual-send-success branch -- this covers the CRM's own read/edit paths. */
const DEMO_LEAD_HEADERS = ["Demo ID", "Demo Sent", "Demo Sent At", "Demo Match Reason"];
let leadsDemoColumnsEnsured = false;
async function ensureLeadsDemoColumns(): Promise<void> {
  if (leadsDemoColumnsEnsured) return;
  if (await tabExists(SHEET_TAB_NAMES.leads)) {
    await ensureTabWithHeaders(SHEET_TAB_NAMES.leads, DEMO_LEAD_HEADERS);
  }
  leadsDemoColumnsEnsured = true;
}

/** Stage 5 (Part A/B/C/D/F) tracking columns. n8n's Log Email Sent node writes Message ID/
 *  Tracking Token itself on send; the pixel/click endpoints and bounce-detection branch write the
 *  rest. This covers the CRM's own read/edit paths the same way ensureLeadsDemoColumns does. */
const TRACKING_LEAD_HEADERS = [
  "Message ID",
  "Tracking Token",
  "N8N Execution Id",
  "Open Count",
  "First Opened At",
  "Last Opened At",
  "Click Count",
  "First Clicked At",
  "Last Clicked At",
  "Bounce Type",
  "Bounced At",
  "Complaint At",
  "Suppressed Reason",
];
let leadsTrackingColumnsEnsured = false;
export async function ensureLeadsTrackingColumns(): Promise<void> {
  if (leadsTrackingColumnsEnsured) return;
  if (await tabExists(SHEET_TAB_NAMES.leads)) {
    await ensureTabWithHeaders(SHEET_TAB_NAMES.leads, TRACKING_LEAD_HEADERS);
  }
  leadsTrackingColumnsEnsured = true;
}

/** Always reads fresh (bypasses the 60s cache) -- used immediately before a targeted write so the
 *  row number and optimistic-concurrency check reflect the true current state of the sheet. */
async function findLeadRowUncached(email: string): Promise<Lead | undefined> {
  const rows = await fetchSheetRows(SHEET_TAB_NAMES.leads);
  const objects = rowsToObjects(rows);
  const target = email.trim().toLowerCase();
  const index = objects.findIndex((row) => (row.Email ?? "").trim().toLowerCase() === target);
  if (index === -1) return undefined;
  return normalizeLead(objects[index], index);
}

function leadToRow(lead: Partial<Lead>): Record<string, string> {
  const row: Record<string, string> = {};
  if (lead.name !== undefined) row.Name = lead.name;
  if (lead.company !== undefined) row.Company = lead.company;
  if (lead.email !== undefined) row.Email = lead.email;
  if (lead.website !== undefined) row.Website = lead.website;
  if (lead.industry !== undefined) row.Industry = lead.industry;
  if (lead.businessType !== undefined) row["Business Type"] = lead.businessType;
  if (lead.leadGenerationType !== undefined) row["Lead Generation Type"] = lead.leadGenerationType;
  if (lead.phone !== undefined) row.Phone = lead.phone;
  if (lead.country !== undefined) row.Country = lead.country;
  if (lead.status !== undefined) row.Status = lead.status;
  if (lead.serviceOffered !== undefined) row["Service Offered"] = lead.serviceOffered;
  if (lead.campaignId !== undefined) row["Campaign ID"] = lead.campaignId;
  if (lead.campaignName !== undefined) row["Campaign Name"] = lead.campaignName;
  if (lead.leadId !== undefined) row["Lead ID"] = lead.leadId;
  if (lead.location !== undefined) row.Location = lead.location;
  if (lead.targetService !== undefined) row["Target Service"] = lead.targetService;
  if (lead.source !== undefined) row.Source = lead.source;
  if (lead.scraperJobId !== undefined) row["Scraper Job ID"] = lead.scraperJobId;
  if (lead.createdAt !== undefined) row["Created At"] = lead.createdAt;
  if (lead.demoId !== undefined) row["Demo ID"] = lead.demoId;
  if (lead.demoSent !== undefined) row["Demo Sent"] = lead.demoSent ? "Yes" : "No";
  if (lead.demoSentAt !== undefined) row["Demo Sent At"] = lead.demoSentAt ?? "";
  if (lead.demoMatchReason !== undefined) row["Demo Match Reason"] = lead.demoMatchReason;
  if (lead.messageId !== undefined) row["Message ID"] = lead.messageId;
  if (lead.trackingToken !== undefined) row["Tracking Token"] = lead.trackingToken;
  if (lead.n8nExecutionId !== undefined) row["N8N Execution Id"] = lead.n8nExecutionId;
  if (lead.openCount !== undefined) row["Open Count"] = String(lead.openCount);
  if (lead.firstOpenedAt !== undefined) row["First Opened At"] = lead.firstOpenedAt ?? "";
  if (lead.lastOpenedAt !== undefined) row["Last Opened At"] = lead.lastOpenedAt ?? "";
  if (lead.clickCount !== undefined) row["Click Count"] = String(lead.clickCount);
  if (lead.firstClickedAt !== undefined) row["First Clicked At"] = lead.firstClickedAt ?? "";
  if (lead.lastClickedAt !== undefined) row["Last Clicked At"] = lead.lastClickedAt ?? "";
  if (lead.bounceType !== undefined) row["Bounce Type"] = lead.bounceType;
  if (lead.bouncedAt !== undefined) row["Bounced At"] = lead.bouncedAt ?? "";
  if (lead.complaintAt !== undefined) row["Complaint At"] = lead.complaintAt ?? "";
  if (lead.suppressedReason !== undefined) row["Suppressed Reason"] = lead.suppressedReason;
  return row;
}

const SCRAPER_FIELD_KEYS = ["campaignName", "leadId", "location", "targetService", "source", "scraperJobId", "createdAt"] as const;
const DEMO_FIELD_KEYS = ["demoId", "demoSent", "demoSentAt", "demoMatchReason"] as const;
const TRACKING_FIELD_KEYS = [
  "messageId",
  "trackingToken",
  "n8nExecutionId",
  "openCount",
  "firstOpenedAt",
  "lastOpenedAt",
  "clickCount",
  "firstClickedAt",
  "lastClickedAt",
  "bounceType",
  "bouncedAt",
  "complaintAt",
  "suppressedReason",
] as const;

function touchesScraperColumns(fields: Partial<Lead>): boolean {
  return SCRAPER_FIELD_KEYS.some((k) => fields[k] !== undefined);
}

function touchesDemoColumns(fields: Partial<Lead>): boolean {
  return DEMO_FIELD_KEYS.some((k) => fields[k] !== undefined);
}

function touchesTrackingColumns(fields: Partial<Lead>): boolean {
  return TRACKING_FIELD_KEYS.some((k) => fields[k] !== undefined);
}

export interface LeadEditableFields {
  name?: string;
  company?: string;
  website?: string;
  industry?: string;
  businessType?: string;
  leadGenerationType?: string;
  phone?: string;
  country?: string;
  serviceOffered?: string;
  status?: LeadStatus;
  /** Assign, change, or (empty string) clear the campaign this lead belongs to. */
  campaignId?: string;
  campaignName?: string;
  leadId?: string;
  location?: string;
  targetService?: string;
  source?: string;
  scraperJobId?: string;
  createdAt?: string;
  demoId?: string;
  demoSent?: boolean;
  demoSentAt?: string | null;
  demoMatchReason?: string;
  messageId?: string;
  trackingToken?: string;
  n8nExecutionId?: string;
  openCount?: number;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  clickCount?: number;
  firstClickedAt?: string | null;
  lastClickedAt?: string | null;
  bounceType?: string;
  bouncedAt?: string | null;
  complaintAt?: string | null;
  suppressedReason?: string;
}

export async function createLead(lead: Lead): Promise<void> {
  if (getDataMode() === "mock") {
    addMockLead(lead);
    return;
  }
  if (lead.campaignId !== undefined) await ensureLeadsCampaignIdColumn();
  if (touchesScraperColumns(lead)) await ensureLeadsScraperColumns();
  if (touchesDemoColumns(lead)) await ensureLeadsDemoColumns();
  if (touchesTrackingColumns(lead)) await ensureLeadsTrackingColumns();
  await appendRow(SHEET_TAB_NAMES.leads, leadToRow(lead));
  invalidateCache();
}

export async function updateLeadFields(email: string, fields: LeadEditableFields): Promise<void> {
  if (getDataMode() === "mock") {
    updateMockLead(email, fields);
    return;
  }
  if (fields.campaignId !== undefined) await ensureLeadsCampaignIdColumn();
  if (touchesScraperColumns(fields)) await ensureLeadsScraperColumns();
  if (touchesDemoColumns(fields)) await ensureLeadsDemoColumns();
  if (touchesTrackingColumns(fields)) await ensureLeadsTrackingColumns();
  const current = await findLeadRowUncached(email);
  if (!current?.rowNumber) throw new Error(`Lead "${email}" was not found in the Leads sheet.`);
  await updateRowFields(SHEET_TAB_NAMES.leads, current.rowNumber, leadToRow(fields), { header: "Email", value: current.email });
  invalidateCache();
}

export async function updateLeadStatus(email: string, status: LeadStatus): Promise<void> {
  return updateLeadFields(email, { status });
}

/** Bulk approve/reject from the Scraped Leads review queue. Best-effort per row -- one failure
 *  (e.g. a row edited/removed elsewhere since the page loaded) doesn't abort the rest; failures
 *  are returned so the caller can report exactly which emails didn't update. */
export async function bulkUpdateLeadStatus(emails: string[], status: LeadStatus): Promise<{ updated: string[]; failed: { email: string; error: string }[] }> {
  const updated: string[] = [];
  const failed: { email: string; error: string }[] = [];
  for (const email of emails) {
    try {
      await updateLeadStatus(email, status);
      updated.push(email);
    } catch (err) {
      failed.push({ email, error: err instanceof Error ? err.message : "Failed to update status." });
    }
  }
  return { updated, failed };
}

/** Bulk delete from the Scraped Leads review queue. Same best-effort-per-row contract as
 *  bulkUpdateLeadStatus. */
export async function bulkDeleteLeads(emails: string[]): Promise<{ deleted: string[]; failed: { email: string; error: string }[] }> {
  const deleted: string[] = [];
  const failed: { email: string; error: string }[] = [];
  for (const email of emails) {
    try {
      await deleteLead(email);
      deleted.push(email);
    } catch (err) {
      failed.push({ email, error: err instanceof Error ? err.message : "Failed to delete lead." });
    }
  }
  return { deleted, failed };
}

/**
 * Resets every "Failed" lead back to "New" so the next scheduled/triggered run picks them up
 * again. Pure Sheets write -- no n8n workflow change needed. Returns how many rows were reset.
 */
export async function retryFailedLeads(): Promise<number> {
  if (getDataMode() === "mock") {
    const { getMockLeads, updateMockLead } = await import("./mock-store");
    const failed = getMockLeads().filter((l) => l.status === "Failed");
    failed.forEach((l) => updateMockLead(l.email, { status: "New" }));
    return failed.length;
  }

  const rows = await fetchSheetRows(SHEET_TAB_NAMES.leads);
  const objects = rowsToObjects(rows);
  const failedRows = objects
    .map((row, i) => normalizeLead(row, i))
    .filter((lead) => lead.status === "Failed" && lead.rowNumber);

  for (const lead of failedRows) {
    await updateRowFields(SHEET_TAB_NAMES.leads, lead.rowNumber!, { Status: "New" }, { header: "Email", value: lead.email });
  }
  if (failedRows.length > 0) invalidateCache();
  return failedRows.length;
}

export async function deleteLead(email: string): Promise<void> {
  if (getDataMode() === "mock") {
    deleteMockLead(email);
    return;
  }
  const current = await findLeadRowUncached(email);
  if (!current?.rowNumber) throw new Error(`Lead "${email}" was not found in the Leads sheet.`);
  await deleteSheetRow(SHEET_TAB_NAMES.leads, current.rowNumber);
  invalidateCache();
}
