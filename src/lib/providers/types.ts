/**
 * Provider adapter seam (Stage 6, Part "every provider implemented through provider adapters").
 * Generalizes the pattern already proven by StorageProvider (src/lib/storage/types.ts) -- every
 * external service the CRM talks to directly gets one adapter implementing this shape, and the
 * Automation Hub's Integrations page renders whatever `getProviderAdapters()` returns, so adding a
 * provider later is a new adapter file + one line in the registry, never a page/business-logic
 * change.
 *
 * This only covers providers the CRM itself holds credentials for and calls directly today:
 * Google Sheets, n8n, and Cloudinary. OpenAI/SMTP run entirely inside n8n's own workflows --
 * the CRM has no credential for them to check, so this plan does not fabricate adapters that would
 * always report "not configured" for something the CRM was never wired to call in the first place.
 * A future adapter for any of them is a new file implementing this same interface.
 */

export type ProviderCategory = "storage" | "workflow-engine" | "spreadsheet" | "ai" | "email";

export interface ProviderHealth {
  /** True once the required env vars are present -- never assumes connectivity, just presence
   *  (same distinction StorageHealth already draws). */
  configured: boolean;
  /** Live reachability, only meaningful when configured is true. */
  connected: boolean;
  detail?: string;
  error?: string;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  category: ProviderCategory;
  isConfigured(): boolean;
  /** Never throws -- failures are reported in the returned health object, not as exceptions, since
   *  this backs a dashboard panel that must render even when the provider is unreachable. */
  getHealth(): Promise<ProviderHealth>;
}
