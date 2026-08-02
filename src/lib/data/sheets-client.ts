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
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
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
