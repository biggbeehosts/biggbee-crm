import type { CampaignMatchSummary } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils/format";

function Row({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "accent" | "muted" }) {
  const valueClass = tone === "accent" ? "text-accent-strong font-semibold" : tone === "muted" ? "text-text-tertiary" : "text-text-primary";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-sm tabular-nums ${valueClass}`}>{formatNumber(value)}</span>
    </div>
  );
}

export function CampaignSummary({ summary }: { summary: CampaignMatchSummary }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Campaign Summary</CardTitle>
          <CardDescription>Based on Campaign ID assignment, not industry or business type</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle">
        <Row label="Total leads (all campaigns)" value={summary.availableLeads} />
        <Row label="Assigned to this campaign" value={summary.assigned} />
        <Row label="Ready for a new-lead run" value={summary.matching} tone="accent" />
        {summary.excludedByStatus > 0 && <Row label="Excluded by status (unsubscribed/spam/not New)" value={summary.excludedByStatus} tone="muted" />}
        {summary.alreadyContacted > 0 && <Row label="Already contacted" value={summary.alreadyContacted} tone="muted" />}
        {summary.belowConfidence > 0 && <Row label="Below confidence threshold" value={summary.belowConfidence} tone="muted" />}
        {summary.missingWebsite > 0 && <Row label="Ready but missing website" value={summary.missingWebsite} tone="muted" />}
      </CardContent>
    </Card>
  );
}
