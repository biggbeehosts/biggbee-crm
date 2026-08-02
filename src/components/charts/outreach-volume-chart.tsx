"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeSeriesPoint } from "@/types";
import { CHART_ACCENT, CHART_AXIS, CHART_DANGER, CHART_GRID } from "./palette";
import { formatDate } from "@/lib/utils/date";

export function OutreachVolumeChart({ data }: { data: TimeSeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_ACCENT} stopOpacity={0.35} />
            <stop offset="95%" stopColor={CHART_ACCENT} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_DANGER} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_DANGER} stopOpacity={0} />
          </linearGradient>
        </defs>
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
        <Area type="monotone" dataKey="sent" name="Sent" stroke={CHART_ACCENT} fill="url(#sentGradient)" strokeWidth={2} />
        <Area type="monotone" dataKey="failed" name="Failed" stroke={CHART_DANGER} fill="url(#failedGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
