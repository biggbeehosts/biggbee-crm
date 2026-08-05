import "server-only";
import { isSheetsConfigured, getDataMode } from "@/lib/data/config";
import { getConnectionStatus } from "@/lib/data/repository";
import type { ProviderAdapter, ProviderHealth } from "./types";

/** Wraps the existing Sheets connection check (getConnectionStatus already does a real live read
 *  of the Leads tab and is used by the Dashboard's status indicator) -- no new Sheets call. */
export const sheetsAdapter: ProviderAdapter = {
  id: "google-sheets",
  name: "Google Sheets (primary data store)",
  category: "spreadsheet",
  isConfigured(): boolean {
    return isSheetsConfigured();
  },
  async getHealth(): Promise<ProviderHealth> {
    if (getDataMode() === "mock") {
      return { configured: false, connected: true, detail: "Running in mock mode -- no Google Sheets credentials needed." };
    }
    const status = await getConnectionStatus();
    return {
      configured: isSheetsConfigured(),
      connected: status.connected,
      detail: status.mode === "google-sheets" ? status.spreadsheetIdMasked : undefined,
      error: status.connected ? undefined : "Could not read the Leads tab -- check GOOGLE_* credentials and sheet sharing.",
    };
  },
};
