"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EngagementTimeSeriesPoint } from "@/types";
import { CHART_ACCENT, CHART_AXIS, CHART_GRID, CHART_PALETTE } from "./palette";
import { formatDate } from "@/lib/utils/date";

/** Opens/Clicks/Replies over time -- unique, non-bot counts only (see tracking-metrics.ts), so
 *  this always undercounts real engagement rather than ever over-claiming it. */
export function EngagementTimeSeriesChart({ data }: { data: EngagementTimeSeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDate(v, { day: "2-digit", month: "short" })}
          tick={{ fill: CHART_AXIS, fontSize: 11 }}
          axisLine={{ stroke: CHART_GRID }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          labelFormatter={(v) => formatDate(v, { day: "2-digit", month: "short", year: "numeric" })}
          contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-secondary)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-tertiary)" }} />
        <Line type="monotone" dataKey="opens" name="Unique opens (est.)" stroke={CHART_ACCENT} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="clicks" name="Unique clicks" stroke={CHART_PALETTE[1]} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="replies" name="Replies" stroke={CHART_PALETTE[4]} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
