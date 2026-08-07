import { Users, Send, ThumbsUp, CalendarCheck2, Gauge, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardMetrics } from "@/types";
import { formatNumber } from "@/lib/utils/format";

export function KpiGrid({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total Leads" value={formatNumber(metrics.totalLeads)} icon={Users} tone="info" />
      <StatCard label="Emails Sent" value={formatNumber(metrics.emailsSent)} icon={Send} tone="accent" />
      <StatCard label="Interested" value={formatNumber(metrics.interested)} icon={ThumbsUp} tone="purple" />
      <StatCard label="Meetings Booked" value={formatNumber(metrics.meetingsBooked)} icon={CalendarCheck2} tone="success" />
      <StatCard label="Avg. Confidence" value={metrics.averageConfidence !== null ? `${metrics.averageConfidence}%` : "—"} icon={Gauge} tone="accent" />
      <StatCard label="Failed Emails" value={formatNumber(metrics.failedEmails)} icon={XCircle} tone={metrics.failedEmails > 0 ? "danger" : "default"} />
    </div>
  );
}
