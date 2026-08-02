import { Send, XCircle, ShieldAlert, Clapperboard, Gauge } from "lucide-react";
import type { ErrorRecord, Lead } from "@/types";
import { StatCard } from "@/components/ui/stat-card";
import { formatNumber, formatPercent, percentageOf } from "@/lib/utils/format";

export function OutreachSummary({ leads, errors }: { leads: Lead[]; errors: ErrorRecord[] }) {
  const sent = leads.filter((l) => l.lastEmailDate && l.status !== "Failed").length;
  const failed = leads.filter((l) => l.status === "Failed").length;
  const validationFailed = errors.filter((e) => e.source === "AI Output Validation" || e.source === "Lead Validation").length;
  const demoIncluded = leads.filter((l) => l.demoVideoAttached).length;
  const scored = leads.filter((l) => l.confidence !== null);
  const avgConfidence = scored.length ? Math.round(scored.reduce((s, l) => s + (l.confidence ?? 0), 0) / scored.length) : null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard label="Sent" value={formatNumber(sent)} icon={Send} tone="success" />
      <StatCard label="Failed" value={formatNumber(failed)} icon={XCircle} tone={failed > 0 ? "danger" : "default"} />
      <StatCard label="Validation Failed" value={formatNumber(validationFailed)} icon={ShieldAlert} tone={validationFailed > 0 ? "warning" : "default"} />
      <StatCard label="Demo Included" value={`${formatNumber(demoIncluded)} (${formatPercent(percentageOf(demoIncluded, sent || 1))})`} icon={Clapperboard} />
      <StatCard label="Avg. Confidence" value={avgConfidence !== null ? `${avgConfidence}%` : "—"} icon={Gauge} tone="accent" />
    </div>
  );
}
