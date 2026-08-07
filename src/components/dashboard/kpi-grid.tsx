import { Users, Send, Reply, ThumbsUp, CalendarCheck2, Gauge } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardMetrics } from "@/types";
import { formatNumber } from "@/lib/utils/format";

/** Failed Emails was removed from this primary row -- failure/bounce detail belongs on
 *  Outreach/Analytics unless it's a currently-actionable issue (see the System module instead). */
export function KpiGrid({ metrics, replies }: { metrics: DashboardMetrics; replies: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total Leads" value={formatNumber(metrics.totalLeads)} icon={Users} tone="info" />
      <StatCard label="Emails Sent" value={formatNumber(metrics.emailsSent)} icon={Send} tone="accent" />
      <StatCard label="Replies" value={formatNumber(replies)} icon={Reply} tone="info" />
      <StatCard label="Interested" value={formatNumber(metrics.interested)} icon={ThumbsUp} tone="purple" />
      <StatCard label="Meetings Booked" value={formatNumber(metrics.meetingsBooked)} icon={CalendarCheck2} tone="success" />
      <StatCard label="Avg. Confidence" value={metrics.averageConfidence !== null ? `${metrics.averageConfidence}%` : "—"} icon={Gauge} tone="accent" />
    </div>
  );
}
