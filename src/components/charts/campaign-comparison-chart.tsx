"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CampaignPerformanceRow } from "@/lib/calculations/tracking-metrics";
import { CHART_AXIS, CHART_GRID, CHART_PALETTE } from "./palette";
import { truncate } from "@/lib/utils/format";

export function CampaignComparisonChart({ data }: { data: CampaignPerformanceRow[] }) {
  const chartData = data.slice(0, 10).map((c) => ({
    name: truncate(c.campaignName, 14),
    Sent: c.sent,
    Opens: c.uniqueOpens,
    Clicks: c.uniqueClicks,
    Replies: c.replies,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-secondary)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-tertiary)" }} />
        <Bar dataKey="Sent" fill={CHART_PALETTE[6]} radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="Opens" fill={CHART_PALETTE[0]} radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="Clicks" fill={CHART_PALETTE[1]} radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey="Replies" fill={CHART_PALETTE[4]} radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
