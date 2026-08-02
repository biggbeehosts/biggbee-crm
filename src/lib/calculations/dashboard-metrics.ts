import type { CountPoint, DashboardMetrics, Lead, PipelineCounts, TimeSeriesPoint } from "@/types";
import { percentageOf } from "@/lib/utils/format";
import { toPipelineStage } from "@/lib/utils/status";
import { toIsoDateKey } from "@/lib/utils/date";
import { confidenceBand } from "@/lib/utils/confidence";

export function computeDashboardMetrics(leads: Lead[]): DashboardMetrics {
  const scored = leads.filter((l): l is Lead & { confidence: number } => l.confidence !== null);
  return {
    totalLeads: leads.length,
    emailsSent: leads.filter((l) => Boolean(l.lastEmailDate)).length,
    interested: leads.filter((l) => l.status === "Interested").length,
    meetingsBooked: leads.filter((l) => l.status === "Meeting Booked" || l.status === "Customer").length,
    averageConfidence: scored.length ? Math.round(scored.reduce((sum, l) => sum + l.confidence, 0) / scored.length) : null,
    failedEmails: leads.filter((l) => l.status === "Failed").length,
  };
}

export function computePipelineCounts(leads: Lead[]): PipelineCounts {
  const counts: PipelineCounts = {
    New: 0,
    Contacted: 0,
    Interested: 0,
    "Meeting Booked": 0,
    Customer: 0,
    Failed: 0,
    Unsubscribed: 0,
  };
  for (const lead of leads) {
    counts[toPipelineStage(lead.status)] += 1;
  }
  return counts;
}

export function leadsByStatus(leads: Lead[]): CountPoint[] {
  const map = new Map<string, number>();
  for (const l of leads) map.set(l.status, (map.get(l.status) ?? 0) + 1);
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function leadsByService(leads: Lead[]): CountPoint[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    const key = l.serviceOffered?.trim() || "Not yet assigned";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function leadsByCountry(leads: Lead[]): CountPoint[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    const key = l.country?.trim() || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function leadsByIndustry(leads: Lead[]): CountPoint[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    const key = l.industry?.trim() || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function confidenceDistribution(leads: Lead[]): CountPoint[] {
  const bands = { High: 0, Medium: 0, Low: 0, Unscored: 0 };
  for (const l of leads) {
    const band = confidenceBand(l.confidence);
    if (band === "high") bands.High += 1;
    else if (band === "medium") bands.Medium += 1;
    else if (band === "low") bands.Low += 1;
    else bands.Unscored += 1;
  }
  return Object.entries(bands).map(([label, value]) => ({ label, value }));
}

export function followUpDistribution(leads: Lead[]): CountPoint[] {
  const map = new Map<number, number>();
  for (const l of leads) map.set(l.followUpCount, (map.get(l.followUpCount) ?? 0) + 1);
  return Array.from(map, ([count, value]) => ({ label: count === 0 ? "First touch" : `Follow-up ${count}`, value })).sort(
    (a, b) => a.label.localeCompare(b.label)
  );
}

export function emailStyleDistribution(leads: Lead[]): CountPoint[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    if (!l.emailStyle) continue;
    const key = l.emailStyle.trim();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function subjectVariantDistribution(leads: Lead[]): CountPoint[] {
  const map = new Map<string, number>();
  for (const l of leads) {
    if (!l.subjectVariant) continue;
    const key = l.subjectVariant.trim();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function outreachVolumeOverTime(leads: Lead[], days = 14): TimeSeriesPoint[] {
  const buckets = new Map<string, { sent: number; failed: number }>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), { sent: 0, failed: 0 });
  }
  for (const l of leads) {
    const key = toIsoDateKey(l.lastEmailDate);
    if (!key || !buckets.has(key)) continue;
    const bucket = buckets.get(key)!;
    if (l.status === "Failed") bucket.failed += 1;
    else bucket.sent += 1;
  }
  return Array.from(buckets, ([date, v]) => ({ date, ...v }));
}

export function demoRecommendationRate(leads: Lead[]): { recommended: number; total: number; rate: number } {
  const recommended = leads.filter((l) => l.demoRecommended).length;
  return { recommended, total: leads.length, rate: percentageOf(recommended, leads.length) };
}
