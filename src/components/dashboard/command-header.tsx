import Link from "next/link";
import { CheckCircle2, Play, TriangleAlert, UserSearch, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardControls } from "./dashboard-controls";
import { formatDateTime } from "@/lib/utils/date";

export type OverallState = "ready" | "setup-incomplete" | "action-needed";

/** Calm-language tri-state (Section 18 of the polish brief): "setup-incomplete" is an expected,
 *  first-run state (amber, not a failure); "action-needed" is reserved for a genuinely active
 *  current failure (red) -- never used for "not configured yet". */
const STATE_META: Record<OverallState, { label: string; badge: "lime" | "warning" | "danger"; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready", badge: "lime", icon: CheckCircle2 },
  "setup-incomplete": { label: "Setup incomplete", badge: "warning", icon: Wrench },
  "action-needed": { label: "Action needed", badge: "danger", icon: TriangleAlert },
};

/** Dashboard hero -- a real operational summary (system state, last sync), not decoration. Quick
 *  actions are anchors into the sections that already own that functionality (Automation Control,
 *  Lead Generation) rather than a second copy of Run Campaign's confirm-dialog flow. */
export function CommandHeader({
  overallState,
  lastSyncedAt,
  mock,
  campaignName,
  eligibleLeads,
}: {
  overallState: OverallState;
  lastSyncedAt: string | null;
  mock: boolean;
  campaignName: string | null;
  eligibleLeads: number | null;
}) {
  const meta = STATE_META[overallState];
  const StateIcon = meta.icon;

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
            <Badge variant={meta.badge} className="gap-1.5">
              <StateIcon className="h-3 w-3" />
              {meta.label}
            </Badge>
            {campaignName && (
              <span className="text-xs text-text-secondary">
                <span className="text-text-tertiary">Campaign:</span> {campaignName}
                {eligibleLeads !== null && (
                  <span className="text-text-tertiary">
                    {" "}
                    · {eligibleLeads} eligible lead{eligibleLeads === 1 ? "" : "s"}
                  </span>
                )}
              </span>
            )}
            <span className="text-xs text-text-tertiary">Synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "just now"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardControls lastSyncedAt={lastSyncedAt} />
          <Button variant="secondary" size="sm" asChild>
            <Link href="/automation-hub/lead-sources">
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
