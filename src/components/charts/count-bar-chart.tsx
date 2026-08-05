"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CountPoint } from "@/types";
import { CHART_AXIS, CHART_GRID, CHART_PALETTE } from "./palette";
import { truncate } from "@/lib/utils/format";

/** Horizontal bar chart for CountPoint[] -- used for status/service/country/industry breakdowns,
 *  and (with `valueSuffix="%"`) for rate comparisons like open/click/reply/bounce rate by campaign. */
export function CountBarChart({
  data,
  maxItems = 8,
  colorByIndex = true,
  valueSuffix = "",
}: {
  data: CountPoint[];
  maxItems?: number;
  colorByIndex?: boolean;
  valueSuffix?: string;
}) {
  const top = data.slice(0, maxItems);
  const rest = data.slice(maxItems);
  const chartData = rest.length && !valueSuffix
    ? [...top, { label: "Other", value: rest.reduce((s, d) => s + d.value, 0) }]
    : top;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={110}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => truncate(v, 16)}
        />
        <Tooltip
          cursor={{ fill: "var(--bg-panel)" }}
          contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-secondary)" }}
          formatter={(v) => [`${v}${valueSuffix}`, ""]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {chartData.map((entry, i) => (
            <Cell key={entry.label} fill={colorByIndex ? CHART_PALETTE[i % CHART_PALETTE.length] : CHART_PALETTE[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
