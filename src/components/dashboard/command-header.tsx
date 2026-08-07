import Link from "next/link";
import { CheckCircle2, Play, TriangleAlert, UserSearch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardControls } from "./dashboard-controls";
import { formatDateTime } from "@/lib/utils/date";

/** Dashboard hero -- a real operational summary (system state, last sync), not decoration. Quick
 *  actions are anchors into the sections that already own that functionality (Automation Control,
 *  Lead Generation) rather than a second copy of Run Campaign's confirm-dialog flow. */
export function CommandHeader({
  systemsHealthy,
  systemsTotal,
  hasCriticalIssue,
  lastSyncedAt,
  mock,
}: {
  systemsHealthy: number;
  systemsTotal: number;
  hasCriticalIssue: boolean;
  lastSyncedAt: string | null;
  mock: boolean;
}) {
  const allHealthy = systemsHealthy === systemsTotal && !hasCriticalIssue;

  return (
    <Card className="bg-grid-texture relative overflow-hidden border-accent/15 p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Operations Command Center</p>
            {mock && <Badge variant="info">Mock data mode</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">Welcome back</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Badge variant={allHealthy ? "lime" : "warning"} className="gap-1.5">
              {allHealthy ? <CheckCircle2 className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
              {allHealthy ? "All systems operational" : `${systemsHealthy}/${systemsTotal} systems healthy`}
            </Badge>
            <span className="text-xs text-text-tertiary">Synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "just now"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardControls lastSyncedAt={lastSyncedAt} />
          <Button variant="secondary" size="sm" asChild>
            <Link href="/lead-generation/scraping-jobs">
              <UserSearch className="h-3.5 w-3.5" /> Scrape Leads
            </Link>
          </Button>
          <Button size="lg" asChild className="shadow-lg shadow-accent/20">
            <Link href="#automation-control">
              <Play className="h-4 w-4" /> Run Campaign
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
