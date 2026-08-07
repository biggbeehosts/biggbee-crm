import { Users, Send, Reply, ThumbsUp, CalendarCheck2, Gauge } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardMetrics } from "@/types";
import { formatNumber } from "@/lib/utils/format";

/** Secondary KPI strip -- deliberately smaller than the 3 primary highlight cards above it
 *  (DashboardHighlights), same numbers at a glance rather than a competing headline. Failed
 *  Emails stays off this row -- failure/bounce detail belongs on Outreach/Analytics unless it's a
 *  currently-actionable issue. */
export function KpiGrid({ metrics, replies }: { metrics: DashboardMetrics; replies: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total Leads" value={formatNumber(metrics.totalLeads)} icon={Users} tone="info" />
      <StatCard label="Sent" value={formatNumber(metrics.emailsSent)} icon={Send} tone="accent" />
      <StatCard label="Replies" value={formatNumber(replies)} icon={Reply} tone="info" />
      <StatCard label="Interested" value={formatNumber(metrics.interested)} icon={ThumbsUp} tone="purple" />
      <StatCard label="Meetings" value={formatNumber(metrics.meetingsBooked)} icon={CalendarCheck2} tone="success" />
      <StatCard label="Avg. Confidence" value={metrics.averageConfidence !== null ? `${metrics.averageConfidence}%` : "—"} icon={Gauge} tone="accent" />
    </div>
  );
}
