import "server-only";
import type { ScraperAgent, ScraperRunPayload, ScraperRunResult } from "@/types";
import { getN8nApiKey, resolveScraperWebhookUrl } from "./config";

/**
 * Apify-backed scrapers can genuinely take longer than the 30s the built-in action webhooks use
 * (src/lib/n8n/client.ts) -- the n8n workflow blocks until it can respond with real results,
 * unlike Run Campaign's fire-and-forget webhooks (see README: "must be set to Respond
 * Immediately"). Google Maps' single synchronous Apify call comfortably finishes well under a
 * minute even at the max lead count; Instagram's per-username profile-scrape chain is slower and
 * was clocked north of 3 minutes end-to-end during Change 2's live verification. 240s gives that
 * headroom without masking a genuinely stuck workflow.
 */
const REQUEST_TIMEOUT_MS = 240_000;

function readableError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "The scraper did not respond within 120 seconds. Check the n8n execution log -- large requested counts may need the workflow's webhook timeout raised.";
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
      return "Could not reach n8n. Check N8N_BASE_URL and that the n8n instance is running.";
    }
    return err.message;
  }
  return "The scraper call failed unexpectedly. Check the n8n execution log for details.";
}

interface RawScraperResponse {
  /** Present when the workflow uses a Respond-to-Webhook node with an explicit success/error
   *  body (future scrapers may). Neither Google Maps nor Instagram's rebuilt workflows use that
   *  node -- like every existing webhook in this n8n instance, they return the default "last
   *  executed node's output" at HTTP 200 always, so success/failure here is read from this field
   *  (or its absence, for a legacy/simple scraper response) rather than trusted from res.ok. */
  success?: boolean;
  error?: string;
  executionId?: string | number;
  jobId?: string;
  requestedCount?: number;
  scrapedCount?: number;
  validCount?: number;
  duplicateCount?: number;
  importedCount?: number;
  errors?: string[];
  message?: string;
}

/**
 * In-process registry of in-flight scraper calls, keyed by Scraping Job id. This is what makes
 * "Cancel" in the Scraping Jobs page real rather than cosmetic: since a run is a single blocking
 * webhook POST (see the module doc comment above), the only genuine way to stop it is to abort
 * that fetch from the same Node process -- there is no n8n admin-API "stop execution" endpoint
 * for a synchronous webhook run. Single Node process, same assumption src/lib/store/json-store.ts
 * already documents. A cancel request for a job with no live entry here (already finished, or the
 * server restarted) is reported honestly as "not cancellable anymore" rather than faked.
 */
const inFlight = new Map<string, AbortController>();
const cancelledJobs = new Set<string>();

/** Returns true if a live in-flight call was found and aborted. */
export function cancelScraperRun(jobId: string): boolean {
  const controller = inFlight.get(jobId);
  if (!controller) return false;
  cancelledJobs.add(jobId);
  controller.abort();
  return true;
}

/**
 * Calls a scraper agent's start webhook server-side (URL + Header Auth key never reach the
 * browser -- same principle as triggerWebhook in client.ts) and waits for n8n's synchronous
 * response, which carries the run's result counts directly (see ScraperAgent.statusMethod:
 * "sync-response" in src/types/scraper.ts).
 */
export async function runScraper(agent: ScraperAgent, payload: ScraperRunPayload): Promise<ScraperRunResult> {
  const url = resolveScraperWebhookUrl(agent);
  if (!url) {
    return { success: false, message: `${agent.name}'s start webhook is not configured. Set its webhook path in Edit Configuration.` };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (agent.authType === "header-auth") {
    const apiKey = getN8nApiKey();
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-KEY"] = apiKey;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  inFlight.set(payload.jobId, controller);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ triggeredBy: "biggbee-crm", timestamp: new Date().toISOString(), ...payload }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: `${agent.name} rejected the request (authentication). Check N8N_API_KEY.` };
      }
      if (res.status === 404) {
        return { success: false, message: `${agent.name}'s webhook was not found. Check the workflow is active in n8n.` };
      }
      if (res.status === 400 || res.status === 422) {
        let detail = "";
        try {
          const body = (await res.json()) as RawScraperResponse;
          detail = body.error ?? body.message ?? "";
        } catch {
          // best-effort
        }
        return { success: false, message: detail || `${agent.name} rejected the request (invalid input).` };
      }
      return { success: false, message: `${agent.name} failed -- n8n responded with HTTP ${res.status}.` };
    }

    const body = (await res.json()) as RawScraperResponse;
    if (body.success === false) {
      return { success: false, message: body.error || body.message || `${agent.name} reported a failure.` };
    }
    return {
      success: true,
      message: body.message || `${agent.name} run complete.`,
      executionId: body.executionId !== undefined ? String(body.executionId) : undefined,
      scrapedCount: body.scrapedCount,
      validCount: body.validCount,
      duplicateCount: body.duplicateCount,
      importedCount: body.importedCount,
      errors: body.errors,
    };
  } catch (err) {
    if (cancelledJobs.has(payload.jobId)) {
      return { success: false, message: `${agent.name} run cancelled.` };
    }
    return { success: false, message: readableError(err) };
  } finally {
    clearTimeout(timeout);
    inFlight.delete(payload.jobId);
    cancelledJobs.delete(payload.jobId);
  }
}
