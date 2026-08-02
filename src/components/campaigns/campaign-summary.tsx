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
          <CardDescription>Why leads are included or excluded, top to bottom</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle">
        <Row label="Available leads" value={summary.availableLeads} />
        <Row label="Matching campaign" value={summary.matching} tone="accent" />
        {summary.excludedByStatus > 0 && <Row label="Excluded by status (unsubscribed/spam)" value={summary.excludedByStatus} tone="muted" />}
        {summary.excludedByCountry > 0 && <Row label="Excluded by country" value={summary.excludedByCountry} tone="muted" />}
        {summary.excludedByIndustry > 0 && <Row label="Excluded by industry" value={summary.excludedByIndustry} tone="muted" />}
        {summary.excludedByBusinessType > 0 && <Row label="Excluded by business type" value={summary.excludedByBusinessType} tone="muted" />}
        {summary.excludedByLeadGenType > 0 && <Row label="Excluded by lead generation type" value={summary.excludedByLeadGenType} tone="muted" />}
        {summary.excludedByService > 0 && <Row label="Excluded by service" value={summary.excludedByService} tone="muted" />}
        {summary.belowConfidence > 0 && <Row label="Below confidence threshold" value={summary.belowConfidence} tone="muted" />}
        {summary.missingRequiredData > 0 && <Row label="Missing required data (unscored)" value={summary.missingRequiredData} tone="muted" />}
        {summary.missingWebsite > 0 && <Row label="Matching but missing website" value={summary.missingWebsite} tone="muted" />}
      </CardContent>
    </Card>
  );
}
