import "server-only";
import { google } from "googleapis";
import { getMissingSheetsEnv, getSheetsEnv } from "./config";

let cachedClient: ReturnType<typeof google.sheets> | null = null;

function getClient() {
  if (cachedClient) return cachedClient;
  // Fail with an actionable message rather than a cryptic JWT/auth error downstream.
  const missing = getMissingSheetsEnv();
  if (missing.length > 0) {
    throw new Error(`Google Sheets is not configured. Set these in .env.local: ${missing.join(", ")}.`);
  }
  const env = getSheetsEnv();
  const auth = new google.auth.JWT({
    email: env.clientEmail,
    key: env.privateKey,
    // Full read/write scope -- the CRM now writes campaigns, lead edits, and unknown-sender
    // review status back to the sheet (see appendRow/updateRow/deleteSheetRow below). Reads use
    // the same client; there is no separate read-only credential anymore.
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

/** Shape of the parts of a gaxios/googleapis error this cares about. Everything is optional --
 *  a JWT/crypto failure (bad private key) never even reaches an HTTP call, so has no .response. */
interface GoogleApiErrorLike {
  message?: string;
  code?: string | number;
  response?: { status?: number; data?: { error?: { message?: string; status?: string } } };
}

function isGoogleApiErrorLike(err: unknown): err is GoogleApiErrorLike {
  return typeof err === "object" && err !== null;
}

/**
 * Converts a raw googleapis/gaxios failure (or a JWT signing failure, which never reaches HTTP
 * at all) into one clear, operator-actionable sentence. The original error's message is never
 * silently dropped -- if none of the known signatures match, it's appended as-is so nothing is
 * hidden, it's just not the FIRST thing the operator reads.
 */
export function translateSheetsError(err: unknown, tabName: string): Error {
  if (!isGoogleApiErrorLike(err)) {
    return new Error(`Unexpected error reading the "${tabName}" tab: ${String(err)}`);
  }

  const status = err.response?.status;
  const apiMessage = err.response?.data?.error?.message ?? err.message ?? "";
  const lower = apiMessage.toLowerCase();

  // JWT/crypto signing failures throw before any HTTP request -- no .response at all.
  if (status === undefined) {
    if (/pem|decoder|private key|asn1|dsa|rsa|invalid key/i.test(apiMessage) || /^error:/i.test(apiMessage)) {
      return new Error(
        `GOOGLE_PRIVATE_KEY is not a valid private key (${apiMessage}). Re-copy the "private_key" value from the ` +
          `service account's JSON key file, keeping its \\n sequences intact.`
      );
    }
    if (/network|econnrefused|enotfound|eai_again|timeout|fetch failed/i.test(lower)) {
      return new Error(`Could not reach Google's API (network error: ${apiMessage}). This is usually temporary -- try again shortly.`);
    }
    return new Error(`Google Sheets request failed: ${apiMessage || "unknown error"}`);
  }

  if (status === 403 && /has not been used in project|it is disabled|service_disabled|api has not been used/i.test(lower)) {
    return new Error(`The Google Sheets API is not enabled for this project. Enable it in Google Cloud Console, then try again. (${apiMessage})`);
  }
  if (status === 403) {
    return new Error(
      `Google denied access to the spreadsheet (403). Share it with the service account's client_email ` +
        `(Viewer access is enough), then try again. (${apiMessage})`
    );
  }
  if (status === 404 && /unable to parse range|not found/i.test(lower) && lower.includes(tabName.toLowerCase())) {
    return new Error(`Tab "${tabName}" was not found in the spreadsheet. Check the tab name matches exactly (including capitalization).`);
  }
  if (status === 400 && /unable to parse range/i.test(lower)) {
    return new Error(`Tab "${tabName}" was not found in the spreadsheet. Check the tab name matches exactly (including capitalization). (${apiMessage})`);
  }
  if (status === 404) {
    return new Error(`Spreadsheet not found (404). Check GOOGLE_SHEET_ID is correct. (${apiMessage})`);
  }
  if (status === 429) {
    return new Error(`Google Sheets API rate limit reached. This is temporary -- the next scheduled refresh will retry automatically.`);
  }
  if (status >= 500) {
    return new Error(`Google's API is temporarily unavailable (${status}). This is on Google's side -- try again shortly. (${apiMessage})`);
  }

  return new Error(`Google Sheets request for "${tabName}" failed (HTTP ${status}): ${apiMessage || "unknown error"}`);
}

/**
 * Reads a whole tab as a 2D array of strings (row 0 = headers). Server-only -- never import this
 * from a client component. Throws a translated, operator-readable Error on failure; callers
 * decide how to degrade.
 */
export async function fetchSheetRows(tabName: string): Promise<string[][]> {
  const env = getSheetsEnv();
  const sheets = getClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheetId,
      // A:AZ covers the current 26 Leads columns with headroom for columns added later.
      range: `${tabName}!A1:AZ10000`,
    });
    return (res.data.values as string[][] | undefined) ?? [];
  } catch (err) {
    throw translateSheetsError(err, tabName);
  }
}

/** Converts a header row + data rows into an array of plain string-keyed objects. */
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => cell !== undefined && cell !== ""))
    .map((row) => {
      const obj: Record<string, string> = {};
      header.forEach((key, i) => {
        if (key) obj[key.trim()] = row[i] ?? "";
      });
      return obj;
    });
}

// ── Write support ────────────────────────────────────────────────────────────────────────────
// Everything below is additive-only by construction: appendRow/updateRowFields never touch a
// column that isn't passed in, ensureTabWithHeaders only ever ADDS columns/tabs, and
// deleteSheetRow removes exactly one row. Nothing here reorders or destroys existing data.

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

interface SheetMeta {
  sheetId: number;
  headers: string[];
  columnCount: number;
}

/** Per-request-ish cache (module-level, short-lived by convention -- callers that mutate should
 *  invalidate via clearSheetMetaCache after structural changes like ensureTabWithHeaders). */
const metaCache = new Map<string, SheetMeta>();

export function clearSheetMetaCache(tabName?: string) {
  if (tabName) metaCache.delete(tabName);
  else metaCache.clear();
}

async function getSheetMeta(tabName: string): Promise<SheetMeta | null> {
  if (metaCache.has(tabName)) return metaCache.get(tabName)!;
  const env = getSheetsEnv();
  const sheets = getClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: env.sheetId, fields: "sheets.properties" });
  const props = (meta.data.sheets ?? []).find((s) => s.properties?.title === tabName)?.properties;
  if (!props || props.sheetId === undefined || props.sheetId === null) return null;
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: env.sheetId, range: `'${tabName}'!A1:BZ1` });
  const headers = ((headerRes.data.values?.[0] as string[] | undefined) ?? []).map((h) => h.trim());
  const result = { sheetId: props.sheetId, headers, columnCount: props.gridProperties?.columnCount ?? headers.length };
  metaCache.set(tabName, result);
  return result;
}

/** Whether a tab already exists (regardless of its headers). Callers that must never create a
 *  tab they don't own (e.g. the n8n-managed Leads tab) should check this before calling
 *  ensureTabWithHeaders, which creates the tab from scratch when it's missing. */
export async function tabExists(tabName: string): Promise<boolean> {
  return (await getSheetMeta(tabName)) !== null;
}

/**
 * Ensures a tab exists with at least the given headers. Creates the tab if missing. If the tab
 * exists but is missing some of the required headers, appends them as NEW trailing columns --
 * existing columns are never reordered, renamed, or removed.
 */
export async function ensureTabWithHeaders(tabName: string, requiredHeaders: string[]): Promise<void> {
  const env = getSheetsEnv();
  const sheets = getClient();
  const existing = await getSheetMeta(tabName);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [requiredHeaders] },
    });
    clearSheetMetaCache(tabName);
    return;
  }

  const missing = requiredHeaders.filter((h) => !existing.headers.includes(h));
  if (missing.length === 0) return;

  const startCol = existing.headers.length;
  const neededColumns = startCol + missing.length;
  // A sheet's grid has a fixed column count independent of how many columns actually have data --
  // writing past it 400s. Grow the grid first (append-only, never shrinks) so a tab that's already
  // full to its allocated width can still receive new trailing columns.
  if (neededColumns > existing.columnCount) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.sheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: existing.sheetId, gridProperties: { columnCount: neededColumns } },
              fields: "gridProperties.columnCount",
            },
          },
        ],
      },
    });
  }

  const range = `'${tabName}'!${columnLetter(startCol)}1`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.sheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [missing] },
  });
  clearSheetMetaCache(tabName);
}

/** Appends one row, mapping `valuesByHeader` onto the tab's actual (live) header order. Returns
 *  the 1-based sheet row number the data landed on. */
export async function appendRow(tabName: string, valuesByHeader: Record<string, string>): Promise<number> {
  const env = getSheetsEnv();
  const sheets = getClient();
  const meta = await getSheetMeta(tabName);
  if (!meta) throw new Error(`Tab "${tabName}" does not exist.`);
  const row = meta.headers.map((h) => valuesByHeader[h] ?? "");
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: env.sheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    const updatedRange = res.data.updates?.updatedRange ?? "";
    const match = updatedRange.match(/![A-Z]+(\d+):/);
    return match ? Number(match[1]) : -1;
  } catch (err) {
    throw translateSheetsError(err, tabName);
  }
}

/**
 * Merges `valuesByHeader` into row `rowNumber` (1-based, header row = 1) -- columns not present
 * in `valuesByHeader` keep their current value. Optional `expectedMatch` is a lightweight
 * optimistic-concurrency guard: if the named column's current value doesn't equal the expected
 * value (e.g. the row's primary key), the update is aborted instead of silently overwriting a
 * row that shifted or changed since the caller last read it.
 */
export async function updateRowFields(
  tabName: string,
  rowNumber: number,
  valuesByHeader: Record<string, string>,
  expectedMatch?: { header: string; value: string }
): Promise<void> {
  const env = getSheetsEnv();
  const sheets = getClient();
  const meta = await getSheetMeta(tabName);
  if (!meta) throw new Error(`Tab "${tabName}" does not exist.`);

  const lastCol = columnLetter(Math.max(meta.headers.length - 1, 0));
  const currentRes = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheetId,
    range: `'${tabName}'!A${rowNumber}:${lastCol}${rowNumber}`,
  });
  const current = (currentRes.data.values?.[0] as string[] | undefined) ?? [];

  if (expectedMatch) {
    const idx = meta.headers.indexOf(expectedMatch.header);
    const actual = idx >= 0 ? (current[idx] ?? "") : "";
    if (actual !== expectedMatch.value) {
      throw new Error(
        `Row ${rowNumber} in "${tabName}" no longer matches what was loaded (expected ${expectedMatch.header}="${expectedMatch.value}", found "${actual}"). ` +
          `It may have been edited elsewhere -- refresh and try again.`
      );
    }
  }

  const merged = meta.headers.map((h, i) => {
    if (h in valuesByHeader) return valuesByHeader[h];
    return current[i] ?? "";
  });

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheetId,
      range: `'${tabName}'!A${rowNumber}:${lastCol}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [merged] },
    });
  } catch (err) {
    throw translateSheetsError(err, tabName);
  }
}

/**
 * Clears every data row's VALUES in a tab (everything from row 2 down) while leaving the header
 * row, the tab itself, and every other tab completely untouched -- this is the one primitive
 * "Reset CRM Data" is built on (see reset-store.ts). Uses spreadsheets.values.clear, not a
 * dimension/row delete: the sheet keeps its exact row/column count and formatting, only cell
 * *values* are removed, so this can never touch a different tab or the spreadsheet structure.
 * Returns how many data rows existed before the clear (for the caller's audit-log count).
 */
export async function clearTabDataRows(tabName: string): Promise<number> {
  const env = getSheetsEnv();
  const sheets = getClient();
  const meta = await getSheetMeta(tabName);
  if (!meta) return 0;
  const lastCol = columnLetter(Math.max(meta.headers.length - 1, 0));
  try {
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheetId,
      range: `'${tabName}'!A2:${lastCol}100000`,
    });
    const rowCount = (current.data.values ?? []).filter((row) => row.some((cell) => cell !== undefined && cell !== "")).length;
    if (rowCount === 0) return 0;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: env.sheetId,
      range: `'${tabName}'!A2:${lastCol}100000`,
      requestBody: {},
    });
    return rowCount;
  } catch (err) {
    throw translateSheetsError(err, tabName);
  }
}

/** Deletes exactly one row (1-based, header row = 1) via a dimension delete so subsequent rows
 *  shift up -- callers that track rowNumber must reload after this. */
export async function deleteSheetRow(tabName: string, rowNumber: number): Promise<void> {
  const env = getSheetsEnv();
  const sheets = getClient();
  const meta = await getSheetMeta(tabName);
  if (!meta) throw new Error(`Tab "${tabName}" does not exist.`);
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.sheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: meta.sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });
  } catch (err) {
    throw translateSheetsError(err, tabName);
  }
}
