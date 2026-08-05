import type { TrackingSnapshot } from "@/lib/calculations/tracking-metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent, percentageOf } from "@/lib/utils/format";
import { formatDateTime } from "@/lib/utils/date";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-sm font-medium tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

/** Stage 5, Part I -- lifetime campaign analytics, computed once server-side (campaigns/page.tsx)
 *  via computeTrackingSnapshot and passed in already-reduced. Nothing here re-fetches events. */
export function CampaignAnalyticsCard({ snapshot }: { snapshot: TrackingSnapshot }) {
  const { kpis, lastActivityAt } = snapshot;
  const sent = kpis.emailsSent || 1;
  const conversionRate = percentageOf(kpis.meetings, sent);
  const bounceRate = percentageOf(kpis.hardBounces, sent);
  const unsubscribeRate = percentageOf(kpis.unsubscribes, sent);
  const complaintRate = percentageOf(kpis.complaints, sent);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Campaign Analytics</CardTitle>
          <CardDescription>Lifetime totals from recorded tracking events — nothing estimated beyond labeled opens</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle">
        <Row label="Leads scraped" value={formatNumber(kpis.leadsScraped)} />
        <Row label="Leads approved" value={formatNumber(kpis.approvedLeads)} />
        <Row label="Emails attempted" value={formatNumber(kpis.emailsAttempted)} />
        <Row label="Emails sent" value={formatNumber(kpis.emailsSent)} />
        <Row label="Confirmed delivered" value={kpis.confirmedDelivered > 0 ? formatNumber(kpis.confirmedDelivered) : "Unknown"} />
        <Row label="Unique opens (estimated)" value={`${formatNumber(kpis.estimatedUniqueOpens)} · ${formatPercent(percentageOf(kpis.estimatedUniqueOpens, sent))}`} />
        <Row label="Unique clicks" value={`${formatNumber(kpis.uniqueClicks)} · ${formatPercent(percentageOf(kpis.uniqueClicks, sent))}`} />
        <Row label="Replies" value={`${formatNumber(kpis.replies)} · ${formatPercent(percentageOf(kpis.replies, sent))}`} />
        <Row label="Positive replies" value={formatNumber(kpis.positiveReplies)} />
        <Row label="Meetings" value={formatNumber(kpis.meetings)} />
        <Row label="Conversion rate (meetings/sent)" value={formatPercent(conversionRate)} />
        <Row label="Demos sent" value={formatNumber(kpis.demosSent)} />
        <Row label="Bounce rate (hard)" value={formatPercent(bounceRate)} />
        <Row label="Unsubscribe rate" value={formatPercent(unsubscribeRate)} />
        <Row label="Complaint rate" value={formatPercent(complaintRate)} />
        <Row
          label="Inbox placement"
          value={kpis.inboxPlacementRate === null ? "Not tested" : formatPercent(kpis.inboxPlacementRate * 100)}
        />
        <Row
          label="Spam placement"
          value={kpis.spamPlacementRate === null ? "Not tested" : formatPercent(kpis.spamPlacementRate * 100)}
        />
        <Row label="Last activity" value={lastActivityAt ? formatDateTime(lastActivityAt) : "No tracked activity yet"} />
      </CardContent>
    </Card>
  );
}
