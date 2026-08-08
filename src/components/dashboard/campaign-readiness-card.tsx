import { CheckCircle2, AlertTriangle, PlugZap, ShieldCheck, ListChecks } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/ui/icon-badge";
import type { CampaignReadiness, ReadinessState } from "@/lib/calculations/campaign-readiness";

const STATE_META: Record<ReadinessState, { label: string; icon: typeof CheckCircle2; tone: string; badge: "success" | "warning" | "outline" }> = {
  ready: { label: "Ready", icon: CheckCircle2, tone: "text-success", badge: "success" },
  attention: { label: "Needs attention", icon: AlertTriangle, tone: "text-warning", badge: "warning" },
  "not-connected": { label: "Not connected", icon: PlugZap, tone: "text-text-tertiary", badge: "outline" },
};

/**
 * Before the operator does anything (selects a campaign, clicks Run), this shows a calm neutral
 * state instead of the full checklist -- an unopened checklist isn't "Not ready"/"Blocks run",
 * it just hasn't been asked yet (Section 8 of the final polish brief: a first-time admin with 0
 * leads and no selection should never see something that reads as broken). `hasInteracted` is
 * owned by CampaignRunPanel and flips true on the first real interaction, never on page load.
 */
export function CampaignReadinessCard({ readiness, hasInteracted }: { readiness: CampaignReadiness; hasInteracted: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <IconBadge icon={ShieldCheck} />
          <div>
            <CardTitle>Campaign Readiness</CardTitle>
            <CardDescription>Checks run against the data already in the CRM</CardDescription>
          </div>
        </div>
        {hasInteracted ? (
          <Badge variant={readiness.canRun ? "success" : "warning"}>{readiness.canRun ? "Ready to run" : "Not ready"}</Badge>
        ) : (
          <Badge variant="outline">Not checked yet</Badge>
        )}
      </CardHeader>

      {hasInteracted ? (
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
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-5 pb-6 pt-1 text-center">
          <ListChecks className="h-5 w-5 text-text-tertiary" />
          <p className="text-sm font-medium text-text-primary">
            {readiness.selectedCampaignName ? "Ready to validate when you run" : "Select a campaign to continue"}
          </p>
          <p className="max-w-[220px] text-[11px] text-text-tertiary">
            {readiness.selectedCampaignName
              ? "Checks run automatically the moment you click Run Campaign."
              : "Pick a campaign above to see what's ready for outreach."}
          </p>
        </div>
      )}
    </Card>
  );
}
