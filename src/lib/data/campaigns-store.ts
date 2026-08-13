import "server-only";
import type { Campaign, CampaignStatus, DemoSelectionMode } from "@/types";
import { getDataMode, SHEET_TAB_NAMES } from "./config";
import { ensureTabWithHeaders, appendRow, updateRowFields, deleteSheetRow, fetchSheetRows, rowsToObjects } from "./sheets-client";
import { readCollection, writeCollection } from "@/lib/store/json-store";
import { logAudit } from "@/lib/audit/log";
import { parseYesNo } from "@/lib/utils/fallback";

const now = () => new Date().toISOString();

/** Sheet column order for the Campaigns tab -- additive only; never remove/reorder once real
 *  data exists (see ensureTabWithHeaders). */
const CAMPAIGN_HEADERS = [
  "ID",
  "Name",
  "Status",
  "Country",
  "Industry",
  "Business Type",
  "Service",
  "Lead Generation Type",
  "Min Confidence",
  "Max Leads Per Run",
  "Daily Send Limit",
  "Notes",
  "Attach Demo",
  "Demo ID",
  "Demo Selection Mode",
  "Require Demo Match",
  "Open Tracking Enabled",
  "Click Tracking Enabled",
  "Reply Tracking Enabled",
  "Deliverability Test Enabled",
  "Language",
  "Website ID",
  "Is Test",
  "Created At",
  "Updated At",
];

function toRow(c: Campaign): Record<string, string> {
  return {
    ID: c.id,
    Name: c.name,
    Status: c.status,
    Country: c.country ?? "",
    Industry: c.industry ?? "",
    "Business Type": c.businessType ?? "",
    Service: c.service ?? "",
    "Lead Generation Type": c.leadGenerationType ?? "",
    "Min Confidence": c.minConfidence === null ? "" : String(c.minConfidence),
    "Max Leads Per Run": c.maxLeadsPerRun === null ? "" : String(c.maxLeadsPerRun),
    "Daily Send Limit": c.dailySendLimit === null ? "" : String(c.dailySendLimit),
    Notes: c.notes ?? "",
    "Attach Demo": c.attachDemo ? "Yes" : "No",
    "Demo ID": c.demoId ?? "",
    "Demo Selection Mode": c.demoSelectionMode,
    "Require Demo Match": c.requireDemoMatch ? "Yes" : "No",
    "Open Tracking Enabled": c.openTrackingEnabled ? "Yes" : "No",
    "Click Tracking Enabled": c.clickTrackingEnabled ? "Yes" : "No",
    "Reply Tracking Enabled": c.replyTrackingEnabled ? "Yes" : "No",
    "Deliverability Test Enabled": c.deliverabilityTestEnabled ? "Yes" : "No",
    Language: c.language ?? "",
    "Website ID": c.websiteId ?? "",
    "Is Test": c.isTest ? "TRUE" : "FALSE",
    "Created At": c.createdAt,
    "Updated At": c.updatedAt,
  };
}

function numOrNull(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Next free CMP-XXXXXX id given the campaign ids already in use. Pads to 6 digits but grows
 *  beyond that rather than colliding once more than 999,999 campaigns exist. */
function generateCampaignId(existingIds: Iterable<string>): string {
  const idSet = existingIds instanceof Set ? existingIds : new Set(existingIds);
  let max = 0;
  for (const id of idSet) {
    const m = /^CMP-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let next = max + 1;
  let candidate = `CMP-${String(next).padStart(6, "0")}`;
  while (idSet.has(candidate)) {
    next += 1;
    candidate = `CMP-${String(next).padStart(6, "0")}`;
  }
  return candidate;
}

/** Public helper for server actions that need a fresh id before a campaign exists yet
 *  (new campaign, duplicate). Stable and unique across both mock and Sheets modes. */
export async function generateNextCampaignId(): Promise<string> {
  const existing = await getCampaigns();
  return generateCampaignId(existing.map((c) => c.id).filter(Boolean));
}

/**
 * Sheet rows written before the ID column existed (or where it was accidentally cleared) have no
 * stable identity yet -- fromRow() below never invents one from row position, since that would
 * change every time a row above it is deleted. Instead, any row missing an ID is assigned a real
 * CMP-XXXXXX id here and immediately persisted back to the same row, so the id is stable from
 * this point forward regardless of future row order changes.
 */
async function migrateMissingCampaignIds(campaigns: Campaign[]): Promise<Campaign[]> {
  const missing = campaigns.filter((c) => !c.id && c.rowNumber);
  if (missing.length === 0) return campaigns;

  const assignedIds = new Set(campaigns.map((c) => c.id).filter(Boolean));
  const byRow = new Map(campaigns.map((c) => [c.rowNumber, c] as const));

  for (const c of missing) {
    const newId = generateCampaignId(assignedIds);
    assignedIds.add(newId);
    await updateRowFields(SHEET_TAB_NAMES.campaigns, c.rowNumber!, { ID: newId });
    await logAudit({
      actor: "system",
      action: "campaign.id_migrated",
      target: newId,
      success: true,
      details: { name: c.name, rowNumber: c.rowNumber },
    });
    byRow.set(c.rowNumber, { ...c, id: newId });
  }

  return campaigns.map((c) => byRow.get(c.rowNumber) ?? c);
}

function fromRow(row: Record<string, string>, rowNumber: number): Campaign {
  return {
    // Left blank (never a row-position guess) when the ID column is empty -- see
    // migrateMissingCampaignIds, which assigns and persists a real id for any row like this.
    id: row.ID || "",
    name: row.Name || "Untitled campaign",
    status: (row.Status as CampaignStatus) || "Draft",
    country: row.Country || undefined,
    industry: row.Industry || undefined,
    businessType: row["Business Type"] || undefined,
    service: row.Service || undefined,
    leadGenerationType: row["Lead Generation Type"] || undefined,
    minConfidence: numOrNull(row["Min Confidence"]),
    maxLeadsPerRun: numOrNull(row["Max Leads Per Run"]),
    dailySendLimit: numOrNull(row["Daily Send Limit"]),
    notes: row.Notes || undefined,
    // Legacy rows written before these columns existed default to "no demo" -- an explicit
    // operator choice is always required to attach one, never assumed.
    attachDemo: parseYesNo(row["Attach Demo"], false),
    demoId: row["Demo ID"] || undefined,
    demoSelectionMode: (["Exact", "Automatic", "None"] as const).includes(row["Demo Selection Mode"] as DemoSelectionMode)
      ? (row["Demo Selection Mode"] as DemoSelectionMode)
      : "None",
    requireDemoMatch: parseYesNo(row["Require Demo Match"], true),
    // Legacy rows written before Stage 5 default to ON for open/click/reply tracking (matches the
    // product decision that tracking is the norm, not an opt-in extra) and OFF for deliverability
    // testing (an explicit, deliberate action an admin opts into per campaign).
    openTrackingEnabled: parseYesNo(row["Open Tracking Enabled"], true),
    clickTrackingEnabled: parseYesNo(row["Click Tracking Enabled"], true),
    replyTrackingEnabled: parseYesNo(row["Reply Tracking Enabled"], true),
    deliverabilityTestEnabled: parseYesNo(row["Deliverability Test Enabled"], false),
    language: row.Language || undefined,
    websiteId: row["Website ID"] || undefined,
    // Additive column -- missing/blank on every row written before it existed reads as false.
    isTest: parseYesNo(row["Is Test"], false),
    // Distinct from isTest itself: true only when the cell was never explicitly set, so legacy
    // rows can be flagged for manual review (see Campaign.isTestUnset doc comment) rather than
    // silently trusted as production.
    isTestUnset: !(row["Is Test"] ?? "").trim(),
    createdAt: row["Created At"] || now(),
    updatedAt: row["Updated At"] || now(),
    rowNumber,
  };
}

const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-us-instagram",
    name: "US Instagram Agencies",
    status: "Active",
    country: "United States",
    industry: "Marketing",
    businessType: "Lead Generation Agency",
    service: "Lead Generation Agents",
    leadGenerationType: "Instagram",
    minConfidence: 70,
    maxLeadsPerRun: 50,
    dailySendLimit: 200,
    notes: "Target agencies running Instagram lead generation campaigns.",
    attachDemo: true,
    demoSelectionMode: "Automatic",
    requireDemoMatch: true,
    openTrackingEnabled: true,
    clickTrackingEnabled: true,
    replyTrackingEnabled: true,
    deliverabilityTestEnabled: false,
    isTest: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

const LOCAL_COLLECTION = "campaigns";

// ── mock / local-store mode (no Sheets) ─────────────────────────────────────────────────────
async function getLocalCampaigns(): Promise<Campaign[]> {
  return readCollection<Campaign[]>(LOCAL_COLLECTION, SEED_CAMPAIGNS);
}

async function saveLocalCampaigns(campaigns: Campaign[]): Promise<void> {
  await writeCollection(LOCAL_COLLECTION, campaigns);
}

// ── sheets mode ──────────────────────────────────────────────────────────────────────────────
let sheetEnsured = false;
async function ensureCampaignsTab(): Promise<void> {
  if (sheetEnsured) return;
  await ensureTabWithHeaders(SHEET_TAB_NAMES.campaigns, CAMPAIGN_HEADERS);
  sheetEnsured = true;
}

// A transient Sheets failure (rate limit, brief network blip, momentary 5xx) here must never crash
// a page that reads campaigns -- same graceful-degrade-to-empty precedent as getLeads/getErrors/
// getKnowledgeBase in repository.ts. getConnectionStatus() (which checks the Leads tab) remains the
// canonical signal for a genuine, persistent outage; this only prevents one transient blip on the
// Campaigns tab specifically from throwing an uncaught exception into a Server Component render.
async function getSheetCampaigns(): Promise<Campaign[]> {
  try {
    await ensureCampaignsTab();
    const rows = await fetchSheetRows(SHEET_TAB_NAMES.campaigns);
    const objects = rowsToObjects(rows);
    const campaigns = objects.map((row, i) => fromRow(row, i + 2)).filter((c) => c.name);
    return await migrateMissingCampaignIds(campaigns);
  } catch {
    return [];
  }
}

export async function getCampaigns(): Promise<Campaign[]> {
  return getDataMode() === "mock" ? getLocalCampaigns() : getSheetCampaigns();
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  const all = await getCampaigns();
  return all.find((c) => c.id === id);
}

export async function upsertCampaign(campaign: Campaign): Promise<void> {
  if (getDataMode() === "mock") {
    const campaigns = await getLocalCampaigns();
    const exists = campaigns.some((c) => c.id === campaign.id);
    const next = exists ? campaigns.map((c) => (c.id === campaign.id ? campaign : c)) : [campaign, ...campaigns];
    await saveLocalCampaigns(next);
    return;
  }

  await ensureCampaignsTab();
  const existing = await getCampaign(campaign.id);
  if (existing?.rowNumber) {
    await updateRowFields(SHEET_TAB_NAMES.campaigns, existing.rowNumber, toRow(campaign), { header: "ID", value: campaign.id });
  } else {
    await appendRow(SHEET_TAB_NAMES.campaigns, toRow(campaign));
  }
}

export async function deleteCampaignById(id: string): Promise<void> {
  if (getDataMode() === "mock") {
    const campaigns = await getLocalCampaigns();
    await saveLocalCampaigns(campaigns.filter((c) => c.id !== id));
    return;
  }

  const existing = await getCampaign(id);
  if (!existing?.rowNumber) return;
  await deleteSheetRow(SHEET_TAB_NAMES.campaigns, existing.rowNumber);
}
