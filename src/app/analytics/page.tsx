export const dynamic = "force-dynamic";

import { getLeads } from "@/lib/data/repository";
import {
  confidenceDistribution,
  demoRecommendationRate,
  emailStyleDistribution,
  followUpDistribution,
  leadsByCountry,
  leadsByIndustry,
  leadsByService,
  outreachVolumeOverTime,
  subjectVariantDistribution,
} from "@/lib/calculations/dashboard-metrics";
import { percentageOf } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { OutreachVolumeChart } from "@/components/charts/outreach-volume-chart";
import { CountBarChart } from "@/components/charts/count-bar-chart";
import { CountPieChart } from "@/components/charts/count-pie-chart";
import { PlaceholderChart } from "@/components/charts/placeholder-chart";
import { StatCard } from "@/components/ui/stat-card";
import { Clapperboard, Send } from "lucide-react";

const FUTURE_METRICS = [
  { title: "Opens", reason: "Open tracking requires a tracking pixel service; the current SMTP send doesn't include one." },
  { title: "Clicks", reason: "Click tracking requires wrapped links; demo links are currently sent as direct Cloudinary URLs." },
  { title: "Replies", reason: "Replies are classified by the workflow but not yet written to a countable sheet column." },
  { title: "Meetings", reason: "Meeting outcomes are tracked as lead status, not as time-series events yet." },
  { title: "Conversions", reason: "Customer conversion events are not timestamped in the current sheet schema." },
  { title: "Reply rate by industry", reason: "Needs reply tracking connected first." },
  { title: "Click rate by demo", reason: "Needs click tracking connected first." },
  { title: "Subject performance", reason: "Needs open/reply tracking connected to compare subject variants." },
];

export default async function AnalyticsPage() {
  const leads = await getLeads();

  const sent = leads.filter((l) => l.lastEmailDate).length;
  const demosSent = leads.filter((l) => l.demoVideoAttached).length;
  const demoRec = demoRecommendationRate(leads);

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Everything measurable from the current sheet data — nothing invented" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Emails Sent" value={sent} icon={Send} tone="accent" />
        <StatCard label="Demo Recommendation Rate" value={`${demoRec.rate}%`} icon={Clapperboard} hint={`${demoRec.recommended} of ${demoRec.total} leads`} />
        <StatCard label="Demo Sent Rate" value={`${percentageOf(demosSent, sent || 1)}%`} icon={Clapperboard} hint={`${demosSent} of ${sent} sends`} />
        <StatCard label="Leads Tracked" value={leads.length} icon={Send} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Emails Sent Over Time" description="Sent vs. failed, last 30 days">
          <OutreachVolumeChart data={outreachVolumeOverTime(leads, 30)} />
        </ChartCard>
        <ChartCard title="Leads Added Over Time" description="Per-day new leads">
          <PlaceholderChart reason="The Leads sheet has no 'Created At' column yet -- add one (n8n can stamp it) to unlock this chart." />
        </ChartCard>
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
          <CountPieChart data={emailStyleDistribution(leads)} />
        </ChartCard>
        <ChartCard title="Subject Variant Distribution">
          <CountPieChart data={subjectVariantDistribution(leads)} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Follow-up Stage Distribution" description="Where leads sit in the 3-stage cadence">
          <CountBarChart data={followUpDistribution(leads)} />
        </ChartCard>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Future metrics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FUTURE_METRICS.map((m) => (
            <ChartCard key={m.title} title={m.title} height={150}>
              <PlaceholderChart reason={m.reason} />
            </ChartCard>
          ))}
        </div>
      </div>
    </div>
  );
}
