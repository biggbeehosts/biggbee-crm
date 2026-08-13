import "server-only";
import type { ScrapingJob, ScrapingJobStatus } from "@/types";
import { getDataMode, SHEET_TAB_NAMES } from "./config";
import { ensureTabWithHeaders, appendRow, updateRowFields, deleteSheetRow, fetchSheetRows, rowsToObjects } from "./sheets-client";
import { readCollection, writeCollection } from "@/lib/store/json-store";

/**
 * Scraping Jobs store -- same dual-mode (mock JSON / Sheets tab) pattern as campaigns-store.ts.
 * Jobs are entirely CRM-owned: the CRM creates a Draft/Queued row before calling a scraper's
 * start webhook, then updates it from that webhook's synchronous JSON response (see
 * src/lib/n8n/scraper-client.ts) -- n8n never writes to this tab directly.
 */

const JOB_HEADERS = [
  "Job ID",
  "Scraper ID",
  "Scraper Name",
  "Campaign ID",
  "Campaign Name",
  "n8n Execution ID",
  "Status",
  "Requested Count",
  "Scraped Count",
  "Valid Count",
  "Duplicate Count",
  "Imported Count",
  "Error Summary",
  "Started At",
  "Completed At",
  "Created By",
  "Inputs",
];

function toRow(j: ScrapingJob): Record<string, string> {
  return {
    "Job ID": j.id,
    "Scraper ID": j.scraperId,
    "Scraper Name": j.scraperName,
    "Campaign ID": j.campaignId,
    "Campaign Name": j.campaignName,
    "n8n Execution ID": j.n8nExecutionId ?? "",
    Status: j.status,
    "Requested Count": String(j.requestedCount),
    "Scraped Count": String(j.scrapedCount),
    "Valid Count": String(j.validCount),
    "Duplicate Count": String(j.duplicateCount),
    "Imported Count": String(j.importedCount),
    "Error Summary": j.errorSummary ?? "",
    "Started At": j.startedAt ?? "",
    "Completed At": j.completedAt ?? "",
    "Created By": j.createdBy,
    Inputs: JSON.stringify(j.inputs ?? {}),
  };
}

function numOr0(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseInputs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function fromRow(row: Record<string, string>, rowNumber: number): ScrapingJob {
  return {
    id: row["Job ID"] || "",
    scraperId: row["Scraper ID"] || "",
    scraperName: row["Scraper Name"] || "",
    campaignId: row["Campaign ID"] || "",
    campaignName: row["Campaign Name"] || "",
    n8nExecutionId: row["n8n Execution ID"] || undefined,
    status: (row.Status as ScrapingJobStatus) || "Draft",
    inputs: parseInputs(row.Inputs),
    requestedCount: numOr0(row["Requested Count"]),
    scrapedCount: numOr0(row["Scraped Count"]),
    validCount: numOr0(row["Valid Count"]),
    duplicateCount: numOr0(row["Duplicate Count"]),
    importedCount: numOr0(row["Imported Count"]),
    errorSummary: row["Error Summary"] || undefined,
    startedAt: row["Started At"] || null,
    completedAt: row["Completed At"] || null,
    createdBy: row["Created By"] || "",
    rowNumber,
  };
}

export function generateJobId(): string {
  return `JOB-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

const LOCAL_COLLECTION = "scraping-jobs";

async function getLocalJobs(): Promise<ScrapingJob[]> {
  return readCollection<ScrapingJob[]>(LOCAL_COLLECTION, []);
}

async function saveLocalJobs(jobs: ScrapingJob[]): Promise<void> {
  await writeCollection(LOCAL_COLLECTION, jobs);
}

let sheetEnsured = false;
async function ensureJobsTab(): Promise<void> {
  if (sheetEnsured) return;
  await ensureTabWithHeaders(SHEET_TAB_NAMES.scrapingJobs, JOB_HEADERS);
  sheetEnsured = true;
}

// Same graceful-degrade-to-empty precedent as getLeads/getErrors in repository.ts -- a transient
// Sheets failure reading Scraping Jobs must never throw uncaught into a page render (e.g. the
// Dashboard, which reads this alongside several other tabs in one Promise.all).
async function getSheetJobs(): Promise<ScrapingJob[]> {
  try {
    await ensureJobsTab();
    const rows = await fetchSheetRows(SHEET_TAB_NAMES.scrapingJobs);
    const objects = rowsToObjects(rows);
    return objects.map((row, i) => fromRow(row, i + 2)).filter((j) => j.id);
  } catch {
    return [];
  }
}

export async function getScrapingJobs(): Promise<ScrapingJob[]> {
  const jobs = getDataMode() === "mock" ? await getLocalJobs() : await getSheetJobs();
  return jobs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export async function getScrapingJob(id: string): Promise<ScrapingJob | undefined> {
  const all = await getScrapingJobs();
  return all.find((j) => j.id === id);
}

export async function createScrapingJob(job: ScrapingJob): Promise<void> {
  if (getDataMode() === "mock") {
    const jobs = await getLocalJobs();
    await saveLocalJobs([job, ...jobs]);
    return;
  }
  await ensureJobsTab();
  await appendRow(SHEET_TAB_NAMES.scrapingJobs, toRow(job));
}

export async function updateScrapingJob(id: string, fields: Partial<ScrapingJob>): Promise<void> {
  if (getDataMode() === "mock") {
    const jobs = await getLocalJobs();
    await saveLocalJobs(jobs.map((j) => (j.id === id ? { ...j, ...fields } : j)));
    return;
  }
  await ensureJobsTab();
  const existing = await getScrapingJob(id);
  if (!existing?.rowNumber) throw new Error(`Scraping job "${id}" was not found.`);
  const merged = { ...existing, ...fields };
  await updateRowFields(SHEET_TAB_NAMES.scrapingJobs, existing.rowNumber, toRow(merged), { header: "Job ID", value: id });
}

export async function deleteScrapingJob(id: string): Promise<void> {
  if (getDataMode() === "mock") {
    const jobs = await getLocalJobs();
    await saveLocalJobs(jobs.filter((j) => j.id !== id));
    return;
  }
  const existing = await getScrapingJob(id);
  if (!existing?.rowNumber) return;
  await deleteSheetRow(SHEET_TAB_NAMES.scrapingJobs, existing.rowNumber);
}
