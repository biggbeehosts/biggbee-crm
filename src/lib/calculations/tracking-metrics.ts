import type { AnalyticsEvent, Campaign, CountPoint, EngagementTimeSeriesPoint, Lead } from "@/types";
import { percentageOf } from "@/lib/utils/format";
import { toIsoDateKey } from "@/lib/utils/date";
import { summarizeDeliverability } from "./deliverability-metrics";
import type { InboxPlacementTest } from "@/types";

/**
 * Core Stage 5 analytics aggregation (Part H/I/L) -- takes already-fetched leads/campaigns/events
 * for a date range and reduces them into everything the dashboard/campaign-detail pages need.
 * Callers fetch `getEvents(filter)` ONCE per render and pass the result in here; nothing in this
 * module re-queries the event store, matching Part L's "no repeated calls" requirement.
 *
 * Every count here traces back to a real Lead row or a real AnalyticsEvent -- nothing is derived
 * from absence (e.g. "no open" is never treated as evidence of anything).
 */

export interface TrackingFilter {
  from: string;
  to: string;
  campaignId?: string;
  source?: string;
  scraperJobId?: string;
  country?: string;
  industry?: string;
  businessType?: string;
  targetService?: string;
  demoId?: string;
  subjectVariant?: string;
  emailStyle?: string;
  recipientDomain?: string;
  /** Domain of the sending identity a send event used -- only present when n8n includes it in an
   *  event's metadata (no sender-rotation config exists on the CRM side yet), see event-only match
   *  below. Never inferred from the single configured Settings sender email. */
  senderDomain?: string;
}

function inRange(iso: string | null | undefined, fromMs: number, toMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= fromMs && t <= toMs;
}

function leadMatchesDimensionFilters(lead: Lead, filter: TrackingFilter): boolean {
  if (filter.campaignId && lead.campaignId !== filter.campaignId) return false;
  if (filter.source && lead.source !== filter.source) return false;
  if (filter.scraperJobId && lead.scraperJobId !== filter.scraperJobId) return false;
  if (filter.country && lead.country !== filter.country) return false;
  if (filter.industry && lead.industry !== filter.industry) return false;
  if (filter.businessType && lead.businessType !== filter.businessType) return false;
  if (filter.targetService && lead.targetService !== filter.targetService) return false;
  if (filter.demoId && lead.demoId !== filter.demoId) return false;
  if (filter.subjectVariant && lead.subjectVariant !== filter.subjectVariant) return false;
  if (filter.emailStyle && lead.emailStyle !== filter.emailStyle) return false;
  if (filter.recipientDomain && lead.email.split("@")[1] !== filter.recipientDomain) return false;
  return true;
}

function eventMatchesDimensionFilters(event: AnalyticsEvent, filter: TrackingFilter, leadsByEmail: Map<string, Lead>): boolean {
  if (filter.campaignId && event.campaignId !== filter.campaignId) return false;
  if (filter.subjectVariant && event.subjectVariant !== filter.subjectVariant) return false;
  if (filter.emailStyle && event.emailStyleVariant !== filter.emailStyle) return false;
  if (filter.demoId && event.demoId !== filter.demoId) return false;
  if (filter.recipientDomain && event.recipientDomain !== filter.recipientDomain) return false;
  if (filter.senderDomain && (event.metadata?.senderDomain as string | undefined) !== filter.senderDomain) return false;
  if (filter.source || filter.scraperJobId || filter.country || filter.industry || filter.businessType || filter.targetService) {
    const lead = event.leadId ? leadsByEmail.get(event.leadId) : undefined;
    if (!lead) return false;
    if (filter.source && lead.source !== filter.source) return false;
    if (filter.scraperJobId && lead.scraperJobId !== filter.scraperJobId) return false;
    if (filter.country && lead.country !== filter.country) return false;
    if (filter.industry && lead.industry !== filter.industry) return false;
    if (filter.businessType && lead.businessType !== filter.businessType) return false;
    if (filter.targetService && lead.targetService !== filter.targetService) return false;
  }
  return true;
}

export interface TrackingKpis {
  leadsScraped: number;
  validLeads: number;
  approvedLeads: number;
  emailsAttempted: number;
  emailsSent: number;
  confirmedDelivered: number;
  estimatedUniqueOpens: number;
  uniqueClicks: number;
  replies: number;
  positiveReplies: number;
  meetings: number;
  demosSent: number;
  hardBounces: number;
  complaints: number;
  unsubscribes: number;
  inboxPlacementRate: number | null;
  spamPlacementRate: number | null;
}

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface CampaignPerformanceRow {
  campaignId: string;
  campaignName: string;
  sent: number;
  uniqueOpens: number;
  openRate: number;
  uniqueClicks: number;
  clickRate: number;
  replies: number;
  replyRate: number;
  meetings: number;
}

export interface VariantPerformanceRow {
  variant: string;
  sent: number;
  uniqueOpens: number;
  openRate: number;
  uniqueClicks: number;
  clickRate: number;
  replies: number;
}

export interface DomainBounceRow {
  domain: string;
  sent: number;
  hardBounces: number;
  softBounces: number;
  bounceRate: number;
}

export interface ScraperPerformanceRow {
  scraperId: string;
  scraperName: string;
  runs: number;
  succeeded: number;
  failed: number;
  imported: number;
}

export interface TrackingSnapshot {
  kpis: TrackingKpis;
  funnel: FunnelStage[];
  emailPerformanceOverTime: EngagementTimeSeriesPoint[];
  campaignPerformance: CampaignPerformanceRow[];
  subjectVariantPerformance: VariantPerformanceRow[];
  emailStylePerformance: VariantPerformanceRow[];
  domainBounceRates: DomainBounceRow[];
  scraperPerformance: ScraperPerformanceRow[];
  demoEngagement: { demosSent: number; demoClicks: number };
  lastActivityAt: string | null;
}

function countType(events: AnalyticsEvent[], type: AnalyticsEvent["type"]): number {
  return events.filter((e) => e.type === type).length;
}

function countUnique(events: AnalyticsEvent[], type: AnalyticsEvent["type"]): number {
  return events.filter((e) => e.type === type && e.isUnique && !e.isBotOrScanner).length;
}

export function computeTrackingSnapshot(
  filter: TrackingFilter,
  leads: Lead[],
  campaigns: Campaign[],
  events: AnalyticsEvent[],
  placementTests: InboxPlacementTest[]
): TrackingSnapshot {
  const fromMs = new Date(filter.from).getTime();
  const toMs = new Date(filter.to).getTime();
  const leadsByEmail = new Map(leads.map((l) => [l.email, l] as const));

  const filteredLeads = leads.filter((l) => leadMatchesDimensionFilters(l, filter));
  const scopedLeads = filteredLeads.filter((l) => inRange(l.createdAt, fromMs, toMs) || !l.createdAt);
  const filteredEvents = events.filter((e) => eventMatchesDimensionFilters(e, filter, leadsByEmail));

  const relevantPlacementTests = filter.campaignId ? placementTests.filter((t) => t.campaignId === filter.campaignId) : placementTests;
  const deliverability = summarizeDeliverability(relevantPlacementTests);

  const kpis: TrackingKpis = {
    leadsScraped: scopedLeads.length,
    // Every Lead row that reached the sheet already passed n8n's Validate Lead check -- there is
    // no separate "invalid" status visible to the CRM (those rows never become Lead rows), so
    // validLeads intentionally equals leadsScraped rather than fabricating a distinct number.
    validLeads: scopedLeads.length,
    approvedLeads: countType(filteredEvents, "lead_approved"),
    emailsAttempted: countType(filteredEvents, "send_attempted"),
    emailsSent: countType(filteredEvents, "sent"),
    confirmedDelivered: countType(filteredEvents, "delivery_confirmed"),
    estimatedUniqueOpens: countUnique(filteredEvents, "open"),
    uniqueClicks: countUnique(filteredEvents, "click"),
    replies: countType(filteredEvents, "reply_received"),
    positiveReplies: countType(filteredEvents, "positive_reply"),
    meetings: countType(filteredEvents, "meeting_booked"),
    demosSent: countType(filteredEvents, "demo_sent"),
    hardBounces: countType(filteredEvents, "hard_bounce"),
    complaints: countType(filteredEvents, "complaint"),
    unsubscribes: countType(filteredEvents, "unsubscribe"),
    inboxPlacementRate: deliverability.inboxPlacementRate,
    spamPlacementRate: deliverability.spamPlacementRate,
  };

  const funnel: FunnelStage[] = [
    { stage: "Scraped", count: kpis.leadsScraped },
    { stage: "Approved", count: kpis.approvedLeads },
    { stage: "Sent", count: kpis.emailsSent },
    { stage: "Opened", count: kpis.estimatedUniqueOpens },
    { stage: "Clicked", count: kpis.uniqueClicks },
    { stage: "Replied", count: kpis.replies },
    { stage: "Meeting", count: kpis.meetings },
  ];

  const emailPerformanceOverTime = buildDailySeries(filteredEvents, filter.from, filter.to);
  const campaignPerformance = buildCampaignPerformance(filteredEvents, campaigns);
  const subjectVariantPerformance = buildVariantPerformance(filteredEvents, (e) => e.subjectVariant);
  const emailStylePerformance = buildVariantPerformance(filteredEvents, (e) => e.emailStyleVariant);
  const domainBounceRates = buildDomainBounceRates(filteredEvents);
  const scraperPerformance = buildScraperPerformance(filteredEvents);
  const demoEngagement = {
    demosSent: kpis.demosSent,
    demoClicks: filteredEvents.filter((e) => e.type === "click" && e.demoId).length,
  };

  const lastActivityAt = filteredEvents.reduce<string | null>((latest, e) => {
    if (!latest || e.timestamp > latest) return e.timestamp;
    return latest;
  }, null);

  return {
    kpis,
    funnel,
    emailPerformanceOverTime,
    campaignPerformance,
    subjectVariantPerformance,
    emailStylePerformance,
    domainBounceRates,
    scraperPerformance,
    demoEngagement,
    lastActivityAt,
  };
}

function buildDailySeries(events: AnalyticsEvent[], from: string, to: string): EngagementTimeSeriesPoint[] {
  const buckets = new Map<string, { opens: number; clicks: number; replies: number }>();
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    buckets.set(d.toISOString().slice(0, 10), { opens: 0, clicks: 0, replies: 0 });
  }
  for (const e of events) {
    const key = toIsoDateKey(e.timestamp);
    if (!key || !buckets.has(key)) continue;
    const bucket = buckets.get(key)!;
    if (e.type === "open" && e.isUnique && !e.isBotOrScanner) bucket.opens += 1;
    else if (e.type === "click" && e.isUnique && !e.isBotOrScanner) bucket.clicks += 1;
    else if (e.type === "reply_received") bucket.replies += 1;
  }
  return Array.from(buckets, ([date, v]) => ({ date, ...v }));
}

function buildCampaignPerformance(events: AnalyticsEvent[], campaigns: Campaign[]): CampaignPerformanceRow[] {
  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name] as const));
  const byCampaign = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    if (!e.campaignId) continue;
    const list = byCampaign.get(e.campaignId) ?? [];
    list.push(e);
    byCampaign.set(e.campaignId, list);
  }
  return [...byCampaign.entries()]
    .map(([campaignId, evs]) => {
      const sent = countType(evs, "sent");
      const uniqueOpens = countUnique(evs, "open");
      const uniqueClicks = countUnique(evs, "click");
      const replies = countType(evs, "reply_received");
      const meetings = countType(evs, "meeting_booked");
      return {
        campaignId,
        campaignName: campaignNames.get(campaignId) ?? campaignId,
        sent,
        uniqueOpens,
        openRate: percentageOf(uniqueOpens, sent || 1),
        uniqueClicks,
        clickRate: percentageOf(uniqueClicks, sent || 1),
        replies,
        replyRate: percentageOf(replies, sent || 1),
        meetings,
      };
    })
    .sort((a, b) => b.sent - a.sent);
}

function buildVariantPerformance(events: AnalyticsEvent[], pick: (e: AnalyticsEvent) => string | undefined): VariantPerformanceRow[] {
  const byVariant = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    const key = pick(e);
    if (!key) continue;
    const list = byVariant.get(key) ?? [];
    list.push(e);
    byVariant.set(key, list);
  }
  return [...byVariant.entries()]
    .map(([variant, evs]) => {
      const sent = countType(evs, "sent");
      const uniqueOpens = countUnique(evs, "open");
      const uniqueClicks = countUnique(evs, "click");
      return {
        variant,
        sent,
        uniqueOpens,
        openRate: percentageOf(uniqueOpens, sent || 1),
        uniqueClicks,
        clickRate: percentageOf(uniqueClicks, sent || 1),
        replies: countType(evs, "reply_received"),
      };
    })
    .sort((a, b) => b.sent - a.sent);
}

function buildDomainBounceRates(events: AnalyticsEvent[]): DomainBounceRow[] {
  const byDomain = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    if (!e.recipientDomain) continue;
    const list = byDomain.get(e.recipientDomain) ?? [];
    list.push(e);
    byDomain.set(e.recipientDomain, list);
  }
  return [...byDomain.entries()]
    .map(([domain, evs]) => {
      const sent = countType(evs, "sent");
      const hardBounces = countType(evs, "hard_bounce");
      const softBounces = countType(evs, "soft_bounce");
      return { domain, sent, hardBounces, softBounces, bounceRate: percentageOf(hardBounces + softBounces, sent || 1) };
    })
    .filter((r) => r.sent > 0 || r.hardBounces > 0 || r.softBounces > 0)
    .sort((a, b) => b.bounceRate - a.bounceRate);
}

function buildScraperPerformance(events: AnalyticsEvent[]): ScraperPerformanceRow[] {
  const byScraper = new Map<string, { name: string; runs: number; succeeded: number; failed: number; imported: number }>();
  for (const e of events) {
    if (e.type !== "scraper_started" && e.type !== "scraper_completed" && e.type !== "scraper_failed") continue;
    const scraperId = (e.metadata?.scraperId as string | undefined) ?? "unknown";
    const scraperName = (e.metadata?.scraperName as string | undefined) ?? scraperId;
    const entry = byScraper.get(scraperId) ?? { name: scraperName, runs: 0, succeeded: 0, failed: 0, imported: 0 };
    if (e.type === "scraper_started") entry.runs += 1;
    if (e.type === "scraper_completed") {
      entry.succeeded += 1;
      entry.imported += Number(e.metadata?.importedCount ?? 0) || 0;
    }
    if (e.type === "scraper_failed") entry.failed += 1;
    byScraper.set(scraperId, entry);
  }
  return [...byScraper.entries()]
    .map(([scraperId, v]) => ({ scraperId, scraperName: v.name, runs: v.runs, succeeded: v.succeeded, failed: v.failed, imported: v.imported }))
    .sort((a, b) => b.runs - a.runs);
}

export function dimensionOptions(
  leads: Lead[],
  events: AnalyticsEvent[] = []
): {
  sources: CountPoint[];
  countries: CountPoint[];
  industries: CountPoint[];
  businessTypes: CountPoint[];
  targetServices: CountPoint[];
  scraperJobs: CountPoint[];
  senderDomains: CountPoint[];
} {
  const uniq = (pick: (l: Lead) => string | undefined): CountPoint[] => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const v = pick(l)?.trim();
      if (!v) continue;
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const senderDomainMap = new Map<string, number>();
  for (const e of events) {
    const domain = (e.metadata?.senderDomain as string | undefined)?.trim();
    if (!domain) continue;
    senderDomainMap.set(domain, (senderDomainMap.get(domain) ?? 0) + 1);
  }
  return {
    sources: uniq((l) => l.source),
    countries: uniq((l) => l.country),
    industries: uniq((l) => l.industry),
    businessTypes: uniq((l) => l.businessType),
    targetServices: uniq((l) => l.targetService),
    scraperJobs: uniq((l) => l.scraperJobId),
    senderDomains: Array.from(senderDomainMap, ([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}
