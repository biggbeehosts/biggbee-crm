import "server-only";
import type { WebsiteRegistryEntry } from "@/types";
import { getN8nApiKey, resolveScraperWebhookUrl } from "./config";

const REQUEST_TIMEOUT_MS = 30_000;

function readableError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "n8n did not respond within 30 seconds. If the crawl runs longer, set its webhook to respond immediately.";
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
      return "Could not reach n8n. Check N8N_BASE_URL and that the n8n instance is running.";
    }
    return err.message;
  }
  return "The sync call failed unexpectedly. Check the n8n execution log for details.";
}

export interface WebsiteSyncTriggerResult {
  success: boolean;
  message: string;
}

/**
 * Triggers a website's KB refresh webhook -- same resolved-URL + Header-Auth call pattern as
 * runScraper (scraper-client.ts), reusing resolveScraperWebhookUrl for path/env-var resolution
 * since WebsiteRegistryEntry's webhookPath/webhookEnvVar fields are shaped identically to
 * ScraperAgent's. The workflow is expected to write its result back into the KB_Cache tab under
 * this site's cacheKey -- this call itself only confirms n8n accepted the trigger; the CRM re-reads
 * the sheet afterward (see syncWebsiteAction) to learn what actually landed.
 */
export async function triggerWebsiteSync(entry: WebsiteRegistryEntry): Promise<WebsiteSyncTriggerResult> {
  const url = resolveScraperWebhookUrl({ startWebhookPath: entry.webhookPath ?? "", startWebhookEnvVar: entry.webhookEnvVar });
  if (!url) {
    return { success: false, message: `${entry.label}'s sync webhook is not configured.` };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getN8nApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-KEY"] = apiKey;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ triggeredBy: "biggbee-crm", action: "syncWebsite", websiteId: entry.id, cacheKey: entry.cacheKey, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { success: false, message: `${entry.label} sync was rejected (authentication). Check N8N_API_KEY.` };
      if (res.status === 404) return { success: false, message: `${entry.label}'s sync webhook was not found. Check that the workflow is active in n8n.` };
      return { success: false, message: `${entry.label} sync failed -- n8n responded with HTTP ${res.status}.` };
    }
    return { success: true, message: `${entry.label} sync triggered. n8n is handling it; results land in the Knowledge Base cache.` };
  } catch (err) {
    return { success: false, message: readableError(err) };
  }
}
