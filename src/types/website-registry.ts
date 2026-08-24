/**
 * Website Registry (Stage 6, Part 8) -- the Knowledge Base grows from one hardcoded site into a
 * registry of websites, each with its own cached knowledge base content. The `KB_Cache` Sheet tab
 * already has a "Cache Key" column (see KnowledgeBaseRecord.cacheKey in knowledge-base.ts) that
 * was previously always read as the literal "latest" -- this registry is what finally uses it,
 * one row/cacheKey per website, so existing behavior for the one seeded default entry is
 * unchanged.
 */

export type WebsiteSyncStatus = "never-synced" | "syncing" | "idle" | "failed";

export const WEBSITE_SYNC_STATUSES: WebsiteSyncStatus[] = ["never-synced", "syncing", "idle", "failed"];

export interface WebsiteRegistryEntry {
  id: string;
  label: string;
  url: string;
  /** Which "Cache Key" value in the KB_Cache sheet tab holds this site's content. Stable once
   *  created -- never reused across entries. */
  cacheKey: string;
  active: boolean;
  /** True only for the single entry seeded from the pre-Stage-6 default KB (biggbees.com,
   *  cacheKey "latest") -- protected from deletion so the existing default behavior always has
   *  somewhere to resolve to. */
  isDefault: boolean;
  /** Bare path joined onto N8N_BASE_URL, or a full same-host URL. Empty when this site has no
   *  dedicated sync webhook yet. */
  webhookPath?: string;
  /** Optional alternative to webhookPath: an env var *name* resolved server-side. */
  webhookEnvVar?: string;
  syncStatus: WebsiteSyncStatus;
  lastSyncAt: string | null;
  /** Best-effort count derived from the KB_Cache tab's section rows for this cacheKey at last
   *  sync -- "pages" in the sense the crawl workflow reports, never guessed by the CRM. */
  pagesIndexed: number;
  autoSyncEnabled: boolean;
  dailySyncEnabled: boolean;
  lastErrorSummary?: string;
  createdAt: string;
  updatedAt: string;
}
