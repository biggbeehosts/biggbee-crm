import { CheckCircle2, AlertTriangle, PlugZap, ShieldCheck } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CampaignReadiness, ReadinessState } from "@/lib/calculations/campaign-readiness";

const STATE_META: Record<ReadinessState, { label: string; icon: typeof CheckCircle2; tone: string; badge: "success" | "warning" | "outline" }> = {
  ready: { label: "Ready", icon: CheckCircle2, tone: "text-success", badge: "success" },
  attention: { label: "Needs attention", icon: AlertTriangle, tone: "text-warning", badge: "warning" },
  "not-connected": { label: "Not connected", icon: PlugZap, tone: "text-text-tertiary", badge: "outline" },
};

export function CampaignReadinessCard({ readiness }: { readiness: CampaignReadiness }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel text-text-secondary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Campaign Readiness</CardTitle>
            <CardDescription>Checks run against the data already in the CRM</CardDescription>
          </div>
        </div>
        <Badge variant={readiness.canRun ? "success" : "warning"}>{readiness.canRun ? "Ready to run" : "Blocked"}</Badge>
      </CardHeader>

      <div className="px-5 pb-5">
        <ul className="divide-y divide-border-subtle">
          {readiness.checks.map((check) => {
            const meta = STATE_META[check.state];
            const Icon = meta.icon;
            return (
              <li key={check.id} className="flex items-start gap-3 py-2.5">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-text-primary">{check.label}</p>
                    {check.blocking && <Badge variant="danger">Blocks run</Badge>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">{check.detail}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-medium ${meta.tone}`}>{meta.label}</span>
              </li>
            );
          })}
        </ul>

        {!readiness.canRun && (
          <div className="mt-3 rounded-xl border border-warning/25 bg-warning/10 p-3">
            <p className="text-[11px] font-medium text-warning">Run Campaign is blocked</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {readiness.blockReasons.map((reason) => (
                <li key={reason} className="text-[11px] text-warning/90">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
