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
  return row;
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
}

export async function createLead(lead: Lead): Promise<void> {
  if (getDataMode() === "mock") {
    addMockLead(lead);
    return;
  }
  if (lead.campaignId !== undefined) await ensureLeadsCampaignIdColumn();
  await appendRow(SHEET_TAB_NAMES.leads, leadToRow(lead));
  invalidateCache();
}

export async function updateLeadFields(email: string, fields: LeadEditableFields): Promise<void> {
  if (getDataMode() === "mock") {
    updateMockLead(email, fields);
    return;
  }
  if (fields.campaignId !== undefined) await ensureLeadsCampaignIdColumn();
  const current = await findLeadRowUncached(email);
  if (!current?.rowNumber) throw new Error(`Lead "${email}" was not found in the Leads sheet.`);
  await updateRowFields(SHEET_TAB_NAMES.leads, current.rowNumber, leadToRow(fields), { header: "Email", value: current.email });
  invalidateCache();
}

export async function updateLeadStatus(email: string, status: LeadStatus): Promise<void> {
  return updateLeadFields(email, { status });
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
