import "server-only";
import { getLeads } from "@/lib/data/repository";
import { getEvents } from "@/lib/data/analytics-events-store";
import { buildDoneKeys, evaluateEligibility, mapRows, matchFolders, validateColumnMap, validateScreenshots } from "./core.mjs";
import type { RedesignConfig } from "./config";
import { checkDriveFolder, checkSheet, listFolderFiles, listSubfolders, readLeadRows, serviceAccountSource, type ConnectionCheck } from "./google";
import { countWorkspaceLiveSends, type RedesignScanSummary } from "./store";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Screenshot-level (per-folder Drive listing) checks are capped per scan to keep the page fast. */
const MAX_SCREENSHOT_CHECKS = 25;
const MAX_TABLE_ROWS = 60;

/** Lead statuses in the general CRM that mean "do not cold-email this address", workspace-scoped. */
const SUPPRESSING_LEAD_STATUSES = new Set(["Unsubscribed", "Spam", "Bounced", "Not Interested"]);

/** Every address that must not be emailed: suppressed general-CRM leads plus unsubscribe,
 *  complaint and hard-bounce events recorded for THIS workspace. Read-only. */
export async function buildSuppressedEmails(workspaceId: string): Promise<string[]> {
  const set = new Set<string>();
  const leads = await getLeads(workspaceId);
  for (const l of leads) if (SUPPRESSING_LEAD_STATUSES.has(l.status)) set.add(l.email.trim().toLowerCase());
  const events = await getEvents(workspaceId, { from: "2020-01-01T00:00:00.000Z", types: ["unsubscribe", "complaint", "hard_bounce"], includeTest: false });
  for (const e of events) if (e.leadId) set.add(e.leadId.trim().toLowerCase());
  return [...set];
}

export interface RedesignSafetySignals {
  /** Sends from this workspace's mailbox by the GENERAL campaigns -- the provider limit is shared. */
  externalSentLastHour: number;
  externalSentLastDay: number;
  sentLastHour: number;
  sentLastDay: number;
  bounceRate: number;
  bounceSample: number;
  complaints: number;
}

export async function getSafetySignals(workspaceId: string): Promise<RedesignSafetySignals> {
  const now = Date.now();
  const dayAgo = new Date(now - DAY).toISOString();
  const events = await getEvents(workspaceId, { from: dayAgo, types: ["sent", "hard_bounce", "complaint"], includeTest: false });
  let sentHour = 0;
  let sentDay = 0;
  let bounces = 0;
  let complaints = 0;
  for (const e of events) {
    const t = new Date(e.timestamp).getTime();
    if (e.type === "sent") {
      sentDay++;
      if (now - t <= HOUR) sentHour++;
    } else if (e.type === "hard_bounce") bounces++;
    else if (e.type === "complaint") complaints++;
  }
  const [lastHour, lastDay] = await Promise.all([countWorkspaceLiveSends(workspaceId, HOUR), countWorkspaceLiveSends(workspaceId, DAY)]);
  const sample = sentDay + lastDay;
  return {
    externalSentLastHour: sentHour,
    externalSentLastDay: sentDay,
    sentLastHour: lastHour,
    sentLastDay: lastDay,
    bounceRate: sample > 0 ? bounces / sample : 0,
    bounceSample: sample,
    complaints,
  };
}

export interface ScanRow {
  businessName: string;
  email: string;
  eligible: boolean;
  reasons: string[];
  folder: { status: string; name?: string; reason?: string };
  screenshots: { checked: boolean; count?: number; ok?: boolean; reason?: string };
}

export interface RedesignScanResult {
  sheet: ConnectionCheck & { headers: string[] };
  drive: ConnectionCheck;
  serviceAccount: "dedicated" | "shared" | "none";
  mappingProblems: string[];
  summary: RedesignScanSummary | null;
  rows: ScanRow[];
  foldersTruncated: boolean;
  screenshotChecksSkipped: number;
}

/** Read-only scan: sheet + Drive connectivity, eligibility, verified folder matching and (for a
 *  bounded number of businesses) screenshot validation. Never writes to the sheet or Drive. */
export async function scanRedesign(config: RedesignConfig, campaignDoneKeys?: Set<string>): Promise<RedesignScanResult> {
  const [sheetCheck, driveCheck] = await Promise.all([checkSheet(config), checkDriveFolder(config)]);
  const base: RedesignScanResult = {
    sheet: { ok: sheetCheck.ok, message: sheetCheck.message, headers: sheetCheck.headers },
    drive: driveCheck,
    serviceAccount: serviceAccountSource(),
    mappingProblems: [],
    summary: null,
    rows: [],
    foldersTruncated: false,
    screenshotChecksSkipped: 0,
  };
  if (config.columnMapError) base.mappingProblems.push(config.columnMapError);
  if (!sheetCheck.ok) return base;

  const mapping = validateColumnMap(config.columnMap, sheetCheck.headers);
  base.mappingProblems.push(...mapping.problems);
  if (!mapping.ok) return base;

  const sheet = await readLeadRows(config);
  if (!sheet.ok) return { ...base, sheet: { ok: false, message: sheet.message, headers: sheetCheck.headers } };
  const businesses = mapRows(sheet.rows, config.columnMap);

  const suppressed = new Set(await buildSuppressedEmails(config.workspaceId));
  const eligibility = new Map<string, { eligible: boolean; reasons: string[] }>();
  const shared = { suppressedEmails: suppressed, eligibleStatuses: config.eligibleStatuses, seenEmails: new Set<string>(), doneKeys: campaignDoneKeys ?? new Set<string>() };
  for (const b of businesses) eligibility.set(b.businessKey + "#" + b.rowIndex, evaluateEligibility(b, shared));

  type FolderMatch = { status: string; folderId?: string; folderName?: string; reason?: string };
  let matches: Record<string, FolderMatch> = {};
  if (driveCheck.ok) {
    const folders = await listSubfolders(config);
    base.foldersTruncated = folders.truncated;
    if (folders.ok) matches = matchFolders(businesses, folders.folders) as Record<string, FolderMatch>;
    else base.drive = { ok: false, message: folders.message };
  }

  let checks = 0;
  const rows: ScanRow[] = [];
  let eligibleCount = 0;
  let matchedCount = 0;
  let blockedCount = 0;
  for (const b of businesses) {
    const elig = eligibility.get(b.businessKey + "#" + b.rowIndex)!;
    const m = matches[b.businessKey] ?? { status: driveCheck.ok ? "unmatched" : "not_checked" };
    let screenshots: ScanRow["screenshots"] = { checked: false };
    if (elig.eligible && m.status === "matched" && m.folderId) {
      if (checks < MAX_SCREENSHOT_CHECKS) {
        checks++;
        const listing = await listFolderFiles(m.folderId);
        if (!listing.ok) screenshots = { checked: true, ok: false, reason: listing.message };
        else {
          const v = validateScreenshots(
            listing.files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size })),
            { maxScreenshots: config.settings.maxScreenshots, maxFileBytes: config.settings.maxFileBytes, maxTotalBytes: config.settings.maxTotalBytes, ignoreNonImageFiles: config.settings.ignoreNonImageFiles }
          );
          screenshots = { checked: true, ok: v.ok, count: v.accepted.length, reason: v.ok ? undefined : v.reason };
        }
      } else base.screenshotChecksSkipped++;
    }
    if (elig.eligible) eligibleCount++;
    if (m.status === "matched") matchedCount++;
    if (elig.eligible && (m.status !== "matched" || screenshots.ok === false)) blockedCount++;
    if (rows.length < MAX_TABLE_ROWS) rows.push({ businessName: b.businessName || "(no name)", email: b.email, eligible: elig.eligible, reasons: elig.reasons, folder: { status: m.status, name: m.folderName, reason: m.reason }, screenshots });
  }

  base.rows = rows;
  base.summary = {
    at: new Date().toISOString(),
    discovered: businesses.length,
    eligible: eligibleCount,
    matched: matchedCount,
    blocked: blockedCount,
    ineligibleSamples: rows.filter((r) => !r.eligible).slice(0, 5).map((r) => ({ businessName: r.businessName, reasons: r.reasons })),
    unmatchedSamples: rows.filter((r) => r.eligible && r.folder.status !== "matched").slice(0, 5).map((r) => ({ businessName: r.businessName, status: r.folder.status, reason: r.folder.reason })),
  };
  return base;
}

export { buildDoneKeys };
