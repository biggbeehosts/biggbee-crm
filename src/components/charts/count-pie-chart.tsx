"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CountPoint } from "@/types";
import { CHART_PALETTE } from "./palette";

export function CountPieChart({ data }: { data: CountPoint[] }) {
  const nonZero = data.filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={nonZero} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
          {nonZero.map((entry, i) => (
            <Cell key={entry.label} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-secondary)" }}
        />
        <Legend
          layout="vertical"
          verticalAlign="middle"
          align="right"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
