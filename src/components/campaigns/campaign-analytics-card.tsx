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

/** Shown instead of a number for any metric SMTP sending structurally cannot confirm (no ESP
 *  webhook/DSN "delivered" receipt, no seed-mailbox provider connected) -- never a fabricated
 *  0 or estimate standing in for real data (Stage 5 completion, Priority 6). */
const UNAVAILABLE = "Unavailable until provider integration";

/** Stage 5, Part I -- lifetime campaign analytics, computed once server-side (campaigns/page.tsx)
 *  via computeTrackingSnapshot and passed in already-reduced. Nothing here re-fetches events. */
export function CampaignAnalyticsCard({ snapshot }: { snapshot: TrackingSnapshot }) {
  const { kpis, lastActivityAt } = snapshot;
  const sent = kpis.emailsSent || 1;
  const bouncedTotal = kpis.hardBounces + kpis.softBounces;
  const conversionRate = percentageOf(kpis.meetings, sent);
  const bounceRate = percentageOf(bouncedTotal, sent);
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
        {/* SMTP-only sending never receives a delivery receipt -- see analytics-events-store.ts
         *  doc comment: nothing here is ever inferred from absence of a bounce. */}
        <Row label="Delivered" value={kpis.confirmedDelivered > 0 ? formatNumber(kpis.confirmedDelivered) : UNAVAILABLE} />
        <Row label="Opened (estimated)" value={`${formatNumber(kpis.estimatedUniqueOpens)} · ${formatPercent(percentageOf(kpis.estimatedUniqueOpens, sent))}`} />
        <Row label="Clicked" value={`${formatNumber(kpis.uniqueClicks)} · ${formatPercent(percentageOf(kpis.uniqueClicks, sent))}`} />
        <Row label="Replied" value={`${formatNumber(kpis.replies)} · ${formatPercent(percentageOf(kpis.replies, sent))}`} />
        <Row label="Positive replies" value={formatNumber(kpis.positiveReplies)} />
        <Row label="Meetings" value={formatNumber(kpis.meetings)} />
        <Row label="Conversion rate (meetings/sent)" value={formatPercent(conversionRate)} />
        <Row label="Demos sent" value={formatNumber(kpis.demosSent)} />
        <Row label="Bounced" value={`${formatNumber(bouncedTotal)} (${formatNumber(kpis.hardBounces)} hard / ${formatNumber(kpis.softBounces)} soft)`} />
        <Row label="Deferred (temporary)" value={formatNumber(kpis.deferred)} />
        <Row label="Complaints" value={formatNumber(kpis.complaints)} />
        <Row label="Unsubscribed" value={formatNumber(kpis.unsubscribes)} />
        <Row label="Bounce rate" value={formatPercent(bounceRate)} />
        <Row label="Unsubscribe rate" value={formatPercent(unsubscribeRate)} />
        <Row label="Complaint rate" value={formatPercent(complaintRate)} />
        <Row
          label="Estimated inbox placement"
          value={kpis.inboxPlacementRate === null ? UNAVAILABLE : formatPercent(kpis.inboxPlacementRate * 100)}
        />
        <Row
          label="Estimated spam placement"
          value={kpis.spamPlacementRate === null ? UNAVAILABLE : formatPercent(kpis.spamPlacementRate * 100)}
        />
        <Row label="Last activity" value={lastActivityAt ? formatDateTime(lastActivityAt) : "No tracked activity yet"} />
      </CardContent>
    </Card>
  );
}
