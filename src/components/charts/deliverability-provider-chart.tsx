"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProviderBreakdown } from "@/lib/calculations/deliverability-metrics";
import { CHART_AXIS, CHART_DANGER, CHART_GRID, CHART_NEUTRAL, CHART_SUCCESS, CHART_WARNING } from "./palette";

/** Stacked Inbox/Promotions/Spam/Missing counts per mailbox provider -- only ever fed real
 *  InboxPlacementTest rows (Stage 5, Part G); an empty `data` means no tests exist, not zero spam. */
export function DeliverabilityProviderChart({ data }: { data: ProviderBreakdown[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey="provider" tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: CHART_AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--text-secondary)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-tertiary)" }} />
        <Bar dataKey="inbox" name="Inbox" stackId="p" fill={CHART_SUCCESS} radius={[0, 0, 0, 0]} maxBarSize={28} />
        <Bar dataKey="promotions" name="Promotions" stackId="p" fill={CHART_WARNING} maxBarSize={28} />
        <Bar dataKey="spam" name="Spam" stackId="p" fill={CHART_DANGER} maxBarSize={28} />
        <Bar dataKey="missing" name="Missing" stackId="p" fill={CHART_NEUTRAL} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
