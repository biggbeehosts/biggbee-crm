export const dynamic = "force-dynamic";

import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getEvents } from "@/lib/data/analytics-events-store";
import { getInboxPlacementTests } from "@/lib/data/deliverability-store";
import {
  confidenceDistribution,
  emailStyleDistribution as leadEmailStyleDistribution,
  followUpDistribution,
  leadsByCountry,
  leadsByIndustry,
  leadsByService,
  outreachVolumeOverTime,
  subjectVariantDistribution as leadSubjectVariantDistribution,
} from "@/lib/calculations/dashboard-metrics";
import { computeTrackingSnapshot, dimensionOptions, type TrackingFilter } from "@/lib/calculations/tracking-metrics";
import { deliverabilityByProvider, spamPlacementByCampaign, summarizeDeliverability } from "@/lib/calculations/deliverability-metrics";
import { NOT_CONNECTED_MESSAGE } from "@/lib/deliverability/provider-adapter";
import { formatPercent, percentageOf } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { OutreachVolumeChart } from "@/components/charts/outreach-volume-chart";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { CountPieChart } from "@/components/charts/count-pie-chart";
import { PlaceholderChart } from "@/components/charts/placeholder-chart";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { EngagementTimeSeriesChart } from "@/components/charts/engagement-time-series-chart";
import { CampaignComparisonChart } from "@/components/charts/campaign-comparison-chart";
import { DeliverabilityProviderChart } from "@/components/charts/deliverability-provider-chart";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { StatCard } from "@/components/ui/stat-card";
import {
  Clapperboard,
  Send,
  MailOpen,
  MousePointerClick,
  Reply,
  CalendarCheck,
  ShieldAlert,
  Ban,
  MailWarning,
  Inbox,
} from "lucide-react";

/** Shown instead of a number for any metric SMTP sending structurally cannot confirm (no ESP
 *  webhook/DSN receipt, no seed-mailbox provider connected) -- never a fabricated 0 or estimate
 *  standing in for real data (Stage 5 completion, Priority 6). */
const UNAVAILABLE = "Unavailable until provider integration";

interface SearchParams {
  range?: string;
  from?: string;
  to?: string;
  campaignId?: string;
  source?: string;
  country?: string;
  industry?: string;
  businessType?: string;
  targetService?: string;
  demoId?: string;
  subjectVariant?: string;
  emailStyle?: string;
  recipientDomain?: string;
  scraperJobId?: string;
  senderDomain?: string;
}

function resolveRange(sp: SearchParams): { from: string; to: string; range: string } {
  const range = sp.range || "30";
  const now = new Date();
  const to = now.toISOString();

  if (range === "custom" && sp.from && sp.to) {
    return { from: new Date(sp.from).toISOString(), to: new Date(sp.to + "T23:59:59.999Z").toISOString(), range };
  }
  if (range === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { from: start.toISOString(), to, range };
  }
  const days = Number(range) > 0 ? Number(range) : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to, range: String(days) };
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { from, to, range } = resolveRange(sp);

  const [leads, campaigns, demos, events, placementTests] = await Promise.all([
    getLeads(),
    getCampaigns(),
    getDemoLibrary(),
    getEvents({ from, to }),
    getInboxPlacementTests(),
  ]);

  const filter: TrackingFilter = {
    from,
    to,
    campaignId: sp.campaignId,
    source: sp.source,
    country: sp.country,
    industry: sp.industry,
    businessType: sp.businessType,
    targetService: sp.targetService,
    demoId: sp.demoId,
    subjectVariant: sp.subjectVariant,
    emailStyle: sp.emailStyle,
    recipientDomain: sp.recipientDomain,
    scraperJobId: sp.scraperJobId,
    senderDomain: sp.senderDomain,
  };

  const snapshot = computeTrackingSnapshot(filter, leads, campaigns, events, placementTests);
  const dims = dimensionOptions(leads, events);
  const recipientDomains = Array.from(new Set(leads.map((l) => l.email.split("@")[1]).filter(Boolean))).sort();
  const subjectVariants = Array.from(new Set(leads.map((l) => l.subjectVariant).filter((v): v is string => Boolean(v)))).sort();
  const emailStyles = Array.from(new Set(leads.map((l) => l.emailStyle).filter((v): v is string => Boolean(v)))).sort();
  const deliverability = summarizeDeliverability(placementTests);
  const byProvider = deliverabilityByProvider(placementTests);
  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name] as const));
  const spamByCampaign = spamPlacementByCampaign(placementTests, campaignNames);

  const demoRecommended = leads.filter((l) => l.demoRecommended).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Campaign, tracking, and deliverability metrics — opens are estimated, never treated as exact"
      />

      <AnalyticsFilters
        values={{ range, from: sp.from, to: sp.to, ...sp }}
        campaigns={campaigns}
        demos={demos}
        dimensions={dims}
        recipientDomains={recipientDomains}
        subjectVariants={subjectVariants}
        emailStyles={emailStyles}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Leads Scraped" value={snapshot.kpis.leadsScraped} icon={Send} />
        <StatCard label="Valid Leads" value={snapshot.kpis.validLeads} icon={Send} hint="Passed scraper validation before reaching the CRM" />
        <StatCard label="Approved Leads" value={snapshot.kpis.approvedLeads} icon={Send} />
        <StatCard label="Emails Attempted" value={snapshot.kpis.emailsAttempted} icon={Send} />
        <StatCard label="Emails Sent" value={snapshot.kpis.emailsSent} icon={Send} tone="accent" />
        <StatCard
          label="Delivered"
          value={snapshot.kpis.confirmedDelivered > 0 ? snapshot.kpis.confirmedDelivered : UNAVAILABLE}
          icon={Send}
          hint="SMTP has no delivery receipt — see Deliverability"
        />
        <StatCard
          label="Estimated Unique Opens"
          value={snapshot.kpis.estimatedUniqueOpens}
          icon={MailOpen}
          hint="Estimated — Apple Mail Privacy Protection and image blocking distort this"
        />
        <StatCard label="Unique Clicks" value={snapshot.kpis.uniqueClicks} icon={MousePointerClick} />
        <StatCard label="Replies" value={snapshot.kpis.replies} icon={Reply} />
        <StatCard label="Positive Replies" value={snapshot.kpis.positiveReplies} icon={Reply} tone="success" />
        <StatCard label="Meetings" value={snapshot.kpis.meetings} icon={CalendarCheck} tone="success" />
        <StatCard label="Demos Sent" value={snapshot.kpis.demosSent} icon={Clapperboard} />
        <StatCard
          label="Bounced"
          value={snapshot.kpis.hardBounces + snapshot.kpis.softBounces}
          icon={MailWarning}
          tone="danger"
          hint={`${snapshot.kpis.hardBounces} hard / ${snapshot.kpis.softBounces} soft`}
        />
        <StatCard label="Bounce Rate" value={formatPercent(percentageOf(snapshot.kpis.hardBounces + snapshot.kpis.softBounces, snapshot.kpis.emailsSent || 1))} icon={MailWarning} />
        <StatCard label="Deferred" value={snapshot.kpis.deferred} icon={MailWarning} hint="Temporary — not suppressed" />
        <StatCard label="Complaints" value={snapshot.kpis.complaints} icon={ShieldAlert} tone="danger" />
        <StatCard label="Unsubscribes" value={snapshot.kpis.unsubscribes} icon={Ban} />
        <StatCard
          label="Estimated Inbox Placement"
          value={snapshot.kpis.inboxPlacementRate === null ? UNAVAILABLE : formatPercent(snapshot.kpis.inboxPlacementRate! * 100)}
          icon={Inbox}
        />
        <StatCard
          label="Estimated Spam Placement"
          value={snapshot.kpis.spamPlacementRate === null ? UNAVAILABLE : formatPercent(snapshot.kpis.spamPlacementRate! * 100)}
          icon={ShieldAlert}
          tone={snapshot.kpis.spamPlacementRate ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Outreach Funnel" description="Scraped → Approved → Sent → Opened → Clicked → Replied → Meeting">
          <FunnelChart data={snapshot.funnel} />
        </ChartCard>
        <ChartCard title="Email Performance Over Time" description="Unique opens (estimated), unique clicks, and replies per day">
          <EngagementTimeSeriesChart data={snapshot.emailPerformanceOverTime} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Campaign Performance Comparison" description="Sent, opens, clicks, and replies per campaign">
          {snapshot.campaignPerformance.length ? (
            <CampaignComparisonChart data={snapshot.campaignPerformance} />
          ) : (
            <PlaceholderChart reason="No campaign-attributed send events in this range yet." />
          )}
        </ChartCard>
        <ChartCard title="Bounce Rate by Recipient Domain">
          {snapshot.domainBounceRates.length ? (
            <CountBarChart data={snapshot.domainBounceRates.map((d) => ({ label: d.domain, value: d.bounceRate }))} valueSuffix="%" />
          ) : (
            <PlaceholderChart reason="No bounce or send events with a recipient domain in this range yet." />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Open Rate by Campaign">
          {snapshot.campaignPerformance.length ? (
            <CountBarChart data={snapshot.campaignPerformance.map((c) => ({ label: c.campaignName, value: c.openRate }))} valueSuffix="%" />
          ) : (
            <PlaceholderChart reason="No campaign sends recorded in this range yet." />
          )}
        </ChartCard>
        <ChartCard title="Click Rate by Campaign">
          {snapshot.campaignPerformance.length ? (
            <CountBarChart data={snapshot.campaignPerformance.map((c) => ({ label: c.campaignName, value: c.clickRate }))} valueSuffix="%" />
          ) : (
            <PlaceholderChart reason="No campaign sends recorded in this range yet." />
          )}
        </ChartCard>
        <ChartCard title="Reply Rate by Campaign">
          {snapshot.campaignPerformance.length ? (
            <CountBarChart data={snapshot.campaignPerformance.map((c) => ({ label: c.campaignName, value: c.replyRate }))} valueSuffix="%" />
          ) : (
            <PlaceholderChart reason="No campaign sends recorded in this range yet." />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Demo Sent and Demo Engagement" description="Sends that carried a demo vs. clicks on a demo link">
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-semibold text-text-primary">{snapshot.demoEngagement.demosSent}</p>
              <p className="text-xs text-text-tertiary">Demos sent</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-semibold text-text-primary">{snapshot.demoEngagement.demoClicks}</p>
              <p className="text-xs text-text-tertiary">Demo link clicks</p>
            </div>
          </div>
        </ChartCard>
        <ChartCard title="Subject Variant Performance" description="Open rate by subject line variant">
          {snapshot.subjectVariantPerformance.length ? (
            <CountBarChart data={snapshot.subjectVariantPerformance.map((v) => ({ label: v.variant, value: v.openRate }))} valueSuffix="%" />
          ) : (
            <PlaceholderChart reason="No subject-variant-tagged sends in this range yet." />
          )}
        </ChartCard>
        <ChartCard title="Email Style Performance" description="Open rate by email style variant">
          {snapshot.emailStylePerformance.length ? (
            <CountBarChart data={snapshot.emailStylePerformance.map((v) => ({ label: v.variant, value: v.openRate }))} valueSuffix="%" />
          ) : (
            <PlaceholderChart reason="No style-tagged sends in this range yet." />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Scraper Performance" description="Runs, success/fail, and leads imported per scraper">
          {snapshot.scraperPerformance.length ? (
            <CountBarChart data={snapshot.scraperPerformance.map((s) => ({ label: s.scraperName, value: s.imported }))} />
          ) : (
            <PlaceholderChart reason="No scraper runs recorded in this range yet." />
          )}
        </ChartCard>
        <ChartCard title="Emails Sent Over Time" description="Sent vs. failed, last 30 days (all-time lead data)">
          <OutreachVolumeChart data={outreachVolumeOverTime(leads, 30)} />
        </ChartCard>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Deliverability</h2>
        {placementTests.length === 0 ? (
          <ChartCard title="Inbox Placement by Mailbox Provider" height={140}>
            <PlaceholderChart reason={NOT_CONNECTED_MESSAGE} />
          </ChartCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Inbox Placement by Mailbox Provider" description={`${deliverability.totalTests} recorded test(s)`}>
              <DeliverabilityProviderChart data={byProvider} />
            </ChartCard>
            <ChartCard title="Spam Placement by Campaign">
              {spamByCampaign.length ? (
                <CountBarChart
                  data={spamByCampaign.map((c) => ({ label: c.campaignName, value: c.spamRate === null ? 0 : Math.round(c.spamRate * 100) }))}
                  valueSuffix="%"
                />
              ) : (
                <PlaceholderChart reason={NOT_CONNECTED_MESSAGE} />
              )}
            </ChartCard>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Leads by Country">
          <CountBarChart data={leadsByCountry(leads)} />
        </ChartCard>
        <ChartCard title="Leads by Industry">
          <CountBarChart data={leadsByIndustry(leads)} />
        </ChartCard>
        <ChartCard title="Leads by Service">
          <CountBarChart data={leadsByService(leads)} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Confidence Bands" description="AI Strategist scoring distribution">
          <CountBarChart data={confidenceDistribution(leads)} />
        </ChartCard>
        <ChartCard title="Email Style Distribution">
          <CountPieChart data={leadEmailStyleDistribution(leads)} />
        </ChartCard>
        <ChartCard title="Subject Variant Distribution">
          <CountPieChart data={leadSubjectVariantDistribution(leads)} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Follow-up Stage Distribution" description="Where leads sit in the 3-stage cadence">
          <CountBarChart data={followUpDistribution(leads)} />
        </ChartCard>
        <ChartCard title="Demo Recommendation Rate" height={150}>
          <div className="flex h-full flex-col items-center justify-center gap-1">
            <p className="text-3xl font-semibold text-text-primary">{leads.length ? Math.round((demoRecommended / leads.length) * 100) : 0}%</p>
            <p className="text-xs text-text-tertiary">
              {demoRecommended} of {leads.length} leads
            </p>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
