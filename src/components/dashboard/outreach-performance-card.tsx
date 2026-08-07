import type { Lead, TimeSeriesPoint } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OutreachVolumeChart } from "@/components/charts/outreach-volume-chart";
import { demoRecommendationRate } from "@/lib/calculations/dashboard-metrics";

/** Real, already-available signals only -- opens/clicks/replies and inbox/spam placement live on
 *  the Analytics page (which also pulls in the tracking-events engine); duplicating that data
 *  fetch here would be more than the "very small UI adjustment" this pass is scoped to. */
export function OutreachPerformanceCard({ leads, volume }: { leads: Lead[]; volume: TimeSeriesPoint[] }) {
  const demo = demoRecommendationRate(leads);
  const bounced = leads.filter((l) => l.bounceType).length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Outreach Performance</CardTitle>
          <CardDescription>Sends over the last two weeks -- opens/clicks/replies live on Analytics</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div style={{ height: 220 }}>
          <OutreachVolumeChart data={volume} />
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-text-tertiary">Demo attach rate</p>
            <p className="text-sm font-semibold text-text-primary">{demo.rate}%</p>
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary">Bounced</p>
            <p className="text-sm font-semibold text-text-primary">{bounced}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-tertiary">Total leads</p>
            <p className="text-sm font-semibold text-text-primary">{leads.length}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
