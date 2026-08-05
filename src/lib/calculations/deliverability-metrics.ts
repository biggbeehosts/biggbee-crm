import type { InboxPlacementTest } from "@/types";
import { isRealPlacementResult } from "@/lib/deliverability/provider-adapter";

/**
 * Pure reducers over already-fetched InboxPlacementTest rows (Stage 5, Part G) -- same style as
 * dashboard-metrics.ts. Never infers a result; only counts what was actually recorded. A test
 * with no recorded rows at all is a distinct state ("not connected") from one with only
 * NotTested/Unknown rows -- callers should check `tests.length === 0` separately.
 */

export interface DeliverabilitySummary {
  totalTests: number;
  inboxCount: number;
  promotionsCount: number;
  spamCount: number;
  missingCount: number;
  unknownOrNotTestedCount: number;
  inboxPlacementRate: number | null;
  spamPlacementRate: number | null;
}

export function summarizeDeliverability(tests: InboxPlacementTest[]): DeliverabilitySummary {
  const real = tests.filter((t) => isRealPlacementResult(t.placementResult));
  const inboxCount = tests.filter((t) => t.placementResult === "Inbox").length;
  const promotionsCount = tests.filter((t) => t.placementResult === "Promotions").length;
  const spamCount = tests.filter((t) => t.placementResult === "Spam").length;
  const missingCount = tests.filter((t) => t.placementResult === "Missing").length;
  const unknownOrNotTestedCount = tests.length - real.length;

  return {
    totalTests: tests.length,
    inboxCount,
    promotionsCount,
    spamCount,
    missingCount,
    unknownOrNotTestedCount,
    inboxPlacementRate: real.length > 0 ? inboxCount / real.length : null,
    spamPlacementRate: real.length > 0 ? spamCount / real.length : null,
  };
}

export interface ProviderBreakdown {
  provider: string;
  inbox: number;
  promotions: number;
  spam: number;
  missing: number;
  unknownOrNotTested: number;
  total: number;
}

export function deliverabilityByProvider(tests: InboxPlacementTest[]): ProviderBreakdown[] {
  const byProvider = new Map<string, InboxPlacementTest[]>();
  for (const t of tests) {
    const key = t.mailboxProvider || "Unknown";
    const list = byProvider.get(key) ?? [];
    list.push(t);
    byProvider.set(key, list);
  }
  return [...byProvider.entries()]
    .map(([provider, rows]) => ({
      provider,
      inbox: rows.filter((r) => r.placementResult === "Inbox").length,
      promotions: rows.filter((r) => r.placementResult === "Promotions").length,
      spam: rows.filter((r) => r.placementResult === "Spam").length,
      missing: rows.filter((r) => r.placementResult === "Missing").length,
      unknownOrNotTested: rows.filter((r) => !isRealPlacementResult(r.placementResult)).length,
      total: rows.length,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface CampaignSpamRow {
  campaignId: string;
  campaignName: string;
  spamRate: number | null;
  tests: number;
}

export function spamPlacementByCampaign(tests: InboxPlacementTest[], campaignNames: Map<string, string>): CampaignSpamRow[] {
  const byCampaign = new Map<string, InboxPlacementTest[]>();
  for (const t of tests) {
    const list = byCampaign.get(t.campaignId) ?? [];
    list.push(t);
    byCampaign.set(t.campaignId, list);
  }
  return [...byCampaign.entries()]
    .map(([campaignId, rows]) => {
      const summary = summarizeDeliverability(rows);
      return {
        campaignId,
        campaignName: campaignNames.get(campaignId) ?? campaignId,
        spamRate: summary.spamPlacementRate,
        tests: rows.length,
      };
    })
    .sort((a, b) => b.tests - a.tests);
}
