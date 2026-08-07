import type { Lead, TimeSeriesPoint } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { OutreachVolumeChart } from "@/components/charts/outreach-volume-chart";
import { demoRecommendationRate } from "@/lib/calculations/dashboard-metrics";
import { formatNumber } from "@/lib/utils/format";
import { Send, MailOpen, MousePointerClick, Reply, Clapperboard, CalendarCheck2, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Tile {
  label: string;
  value: string;
  icon: typeof Send;
  tone: "info" | "accent" | "purple" | "danger" | "success";
}

/** Real, already-available signals only -- every number here reads directly off the `leads` array
 *  the dashboard already fetches (openCount/clickCount/demoSent are real Lead fields, not derived
 *  estimates) or the `replies` count the page computed once via the same computeTrackingSnapshot()
 *  Analytics uses (see dashboard/page.tsx), so this never drifts from Analytics' own Replies KPI.
 *  Bounce detail stays on Outreach/Analytics -- it's not in this card's fixed six per the design
 *  brief unless it becomes a currently-actionable issue (see System module instead). */
export function OutreachPerformanceCard({ leads, volume, replies }: { leads: Lead[]; volume: TimeSeriesPoint[]; replies: number }) {
  const demo = demoRecommendationRate(leads);
  const sent = leads.filter((l) => l.lastEmailDate).length;
  const opened = leads.filter((l) => (l.openCount ?? 0) > 0).length;
  const clicked = leads.filter((l) => (l.clickCount ?? 0) > 0).length;
  const demosSent = leads.filter((l) => l.demoSent).length;
  const meetings = leads.filter((l) => l.status === "Meeting Booked" || l.status === "Customer").length;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : null;
  const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : null;

  const tiles: Tile[] = [
    { label: "Sent", value: formatNumber(sent), icon: Send, tone: "info" },
    { label: openRate === null ? "Opens" : `Opens (${openRate}%)`, value: formatNumber(opened), icon: MailOpen, tone: "accent" },
    { label: clickRate === null ? "Clicks" : `Clicks (${clickRate}%)`, value: formatNumber(clicked), icon: MousePointerClick, tone: "purple" },
    { label: "Replies", value: formatNumber(replies), icon: Reply, tone: "info" },
    { label: "Demos sent", value: formatNumber(demosSent), icon: Clapperboard, tone: "purple" },
    { label: "Meetings", value: formatNumber(meetings), icon: CalendarCheck2, tone: "success" },
  ];

  const TONE_TEXT: Record<Tile["tone"], string> = {
    info: "text-info",
    accent: "text-accent",
    purple: "text-category-purple",
    danger: "text-danger",
    success: "text-success",
  };

  return (
    <Card level={2} className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Zap} tone="accent" size="sm" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Outreach Command Center</p>
            <p className="text-xs text-text-tertiary">Sends over the last two weeks -- demo attach rate {demo.rate}%</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-border-subtle bg-panel px-2.5 py-2">
              <t.icon className={cn("h-3.5 w-3.5", TONE_TEXT[t.tone])} />
              <p className="mt-1 text-base font-bold tracking-tight text-text-primary">{t.value}</p>
              <p className="truncate text-[10px] text-text-tertiary">{t.label}</p>
            </div>
          ))}
        </div>
        <div style={{ height: 180 }}>
          <OutreachVolumeChart data={volume} />
        </div>
      </CardContent>
    </Card>
  );
}
