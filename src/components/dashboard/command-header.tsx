import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <Card className="bg-grid-texture relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">Welcome back</h1>
            {mock && <Badge variant="accent">Mock data mode</Badge>}
          </div>
          <p className="mt-1 text-sm text-text-tertiary">Here&apos;s the current state of the Biggbee AI outbound outreach system.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant={allHealthy ? "success" : "warning"} className="gap-1.5">
              {allHealthy ? <CheckCircle2 className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
              {allHealthy ? "All systems operational" : `${systemsHealthy}/${systemsTotal} systems healthy`}
            </Badge>
            <span className="text-xs text-text-tertiary">Synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "just now"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardControls lastSyncedAt={lastSyncedAt} />
          <Link
            href="#automation-control"
            className="inline-flex h-8 items-center rounded-lg border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-panel hover:text-text-primary"
          >
            Run Campaign
          </Link>
          <Link
            href="/lead-generation/scraping-jobs"
            className="inline-flex h-8 items-center rounded-lg border border-border-subtle px-3 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-panel hover:text-text-primary"
          >
            Scrape Leads
          </Link>
        </div>
      </div>
    </Card>
  );
}
