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

/**
 * Reads a whole tab as a 2D array of strings (row 0 = headers). Server-only -- never import this
 * from a client component. Throws on failure; callers decide how to degrade.
 */
export async function fetchSheetRows(tabName: string): Promise<string[][]> {
  const env = getSheetsEnv();
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheetId,
    // A:AZ covers the current 26 Leads columns with headroom for columns added later.
    range: `${tabName}!A1:AZ10000`,
  });
  return (res.data.values as string[][] | undefined) ?? [];
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
