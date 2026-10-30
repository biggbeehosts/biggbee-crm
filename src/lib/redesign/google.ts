import "server-only";
import { google } from "googleapis";
import { getSheetsEnv } from "@/lib/data/config";
import { GOOGLE_FOLDER_MIME } from "./core.mjs";
import type { RedesignConfig } from "./config";

/**
 * READ-ONLY access to the redesign sheet and Drive folder, used only for the CRM page's status
 * and "scan" preview. It uses readonly scopes, so it is structurally incapable of editing the
 * sheet or Drive. It never touches the general CRM sheet (GOOGLE_SHEET_ID): the spreadsheet id
 * always comes from the redesign config. The actual campaign run (reading, downloading, tracking
 * writes) happens in the dedicated n8n workflow with its own authorised credentials.
 *
 * Service-account identity: REDESIGN_GOOGLE_CLIENT_EMAIL / REDESIGN_GOOGLE_PRIVATE_KEY if set,
 * otherwise the CRM's existing GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY. Either way the account
 * must be given Viewer access to the redesign sheet and the Drive main folder to be readable.
 */

function credentials(): { email: string; key: string; usingDedicated: boolean } | null {
  const dedicatedEmail = (process.env.REDESIGN_GOOGLE_CLIENT_EMAIL ?? "").trim();
  const dedicatedKey = (process.env.REDESIGN_GOOGLE_PRIVATE_KEY ?? "").trim();
  if (dedicatedEmail && dedicatedKey) {
    return { email: dedicatedEmail, key: dedicatedKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n"), usingDedicated: true };
  }
  const shared = getSheetsEnv();
  if (shared.clientEmail && shared.privateKey) return { email: shared.clientEmail, key: shared.privateKey, usingDedicated: false };
  return null;
}

function auth() {
  const c = credentials();
  if (!c) return null;
  return new google.auth.JWT({
    email: c.email,
    key: c.key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.readonly"],
  });
}

/** Drive query strings are built from IDs; refuse anything that is not a plain Drive ID. */
function safeId(id: string): string | null {
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
}

function readable(err: unknown, what: string): string {
  const e = err as { code?: number | string; response?: { status?: number }; message?: string };
  const status = e?.response?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  if (status === 404) return `${what} was not found. Check the ID, and that it is shared with the service account.`;
  if (status === 403) return `Access to ${what} was denied. Share it with the service account (Viewer is enough).`;
  if (status === 401) return `The service account could not authenticate for ${what}.`;
  return `${what} could not be read (${e?.message ?? "unknown error"}).`;
}

export interface ConnectionCheck {
  ok: boolean;
  message: string;
  detail?: string;
}

export function serviceAccountSource(): "dedicated" | "shared" | "none" {
  const c = credentials();
  return !c ? "none" : c.usingDedicated ? "dedicated" : "shared";
}

export async function checkSheet(config: RedesignConfig): Promise<ConnectionCheck & { headers: string[]; rowCount: number }> {
  const a = auth();
  if (!a) return { ok: false, message: "No Google service-account credentials are configured on the server.", headers: [], rowCount: 0 };
  if (!config.sheetId || !config.leadsTab) return { ok: false, message: "Sheet ID and leads tab are not configured.", headers: [], rowCount: 0 };
  try {
    const sheets = google.sheets({ version: "v4", auth: a });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: `'${config.leadsTab.replace(/'/g, "''")}'` });
    const values = res.data.values ?? [];
    return { ok: true, message: `Connected -- ${Math.max(values.length - 1, 0)} row(s) in "${config.leadsTab}".`, headers: (values[0] ?? []).map(String), rowCount: Math.max(values.length - 1, 0) };
  } catch (err) {
    return { ok: false, message: readable(err, "the redesign sheet"), headers: [], rowCount: 0 };
  }
}

export async function readLeadRows(config: RedesignConfig): Promise<{ ok: boolean; message: string; headers: string[]; rows: Record<string, string>[] }> {
  const a = auth();
  if (!a) return { ok: false, message: "No Google service-account credentials are configured on the server.", headers: [], rows: [] };
  try {
    const sheets = google.sheets({ version: "v4", auth: a });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: config.sheetId, range: `'${config.leadsTab.replace(/'/g, "''")}'` });
    const values = res.data.values ?? [];
    const headers = (values[0] ?? []).map(String);
    const rows = values.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] == null ? "" : String(r[i])])));
    return { ok: true, message: "ok", headers, rows };
  } catch (err) {
    return { ok: false, message: readable(err, "the redesign sheet"), headers: [], rows: [] };
  }
}

export interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export async function listSubfolders(config: RedesignConfig): Promise<{ ok: boolean; message: string; folders: DriveEntry[]; truncated: boolean }> {
  const a = auth();
  if (!a) return { ok: false, message: "No Google service-account credentials are configured on the server.", folders: [], truncated: false };
  try {
    const drive = google.drive({ version: "v3", auth: a });
    const res = await drive.files.list({
      q: `'${safeId(config.driveFolderId) ?? 'invalid'}' in parents and mimeType = '${GOOGLE_FOLDER_MIME}' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return { ok: true, message: "ok", folders: (res.data.files ?? []) as DriveEntry[], truncated: !!res.data.nextPageToken };
  } catch (err) {
    return { ok: false, message: readable(err, "the Drive main folder"), folders: [], truncated: false };
  }
}

export async function listFolderFiles(folderId: string): Promise<{ ok: boolean; message: string; files: DriveEntry[] }> {
  const a = auth();
  if (!a) return { ok: false, message: "No Google service-account credentials are configured on the server.", files: [] };
  try {
    const drive = google.drive({ version: "v3", auth: a });
    const res = await drive.files.list({
      q: `'${safeId(folderId) ?? 'invalid'}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, size)",
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return { ok: true, message: "ok", files: (res.data.files ?? []) as DriveEntry[] };
  } catch (err) {
    return { ok: false, message: readable(err, "a business folder"), files: [] };
  }
}

export async function checkDriveFolder(config: RedesignConfig): Promise<ConnectionCheck> {
  const a = auth();
  if (!a) return { ok: false, message: "No Google service-account credentials are configured on the server." };
  if (!config.driveFolderId) return { ok: false, message: "Drive main folder is not configured." };
  try {
    const drive = google.drive({ version: "v3", auth: a });
    const res = await drive.files.get({ fileId: config.driveFolderId, fields: "id, name, mimeType", supportsAllDrives: true });
    if (res.data.mimeType !== GOOGLE_FOLDER_MIME) return { ok: false, message: "The configured Drive ID is not a folder." };
    return { ok: true, message: `Connected -- folder "${res.data.name}".` };
  } catch (err) {
    return { ok: false, message: readable(err, "the Drive main folder") };
  }
}
