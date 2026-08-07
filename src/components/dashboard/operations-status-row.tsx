import type { ProviderHealthRow } from "@/lib/providers/registry";
import type { Campaign } from "@/types";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";
import type { WorkflowState } from "@/lib/n8n/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

interface HealthModule {
  label: string;
  ok: boolean;
  detail?: string;
}

function toModule(p: ProviderHealthRow): HealthModule {
  return { label: p.name, ok: p.configured && p.connected, detail: p.error ?? p.detail };
}

function ModuleCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <Card level={2} className="p-3.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/70">{eyebrow}</p>
      {children}
    </Card>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />}
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", ok ? "bg-accent" : "bg-warning")} />
    </span>
  );
}

const WORKFLOW_STATE_LABEL: Record<WorkflowState, string> = {
  running: "Running",
  idle: "Idle",
  failed: "Failed",
  unknown: "Unknown",
};

/**
 * Compact instrumentation row -- System / Campaign / Safety as three small modules side by side,
 * replacing the old full-width SystemHealthStrip + separate Automation Control section. Every
 * value here is real and already computed server-side (providers, readiness, campaign fields) --
 * nothing is invented. "Suppression state" from the design brief has no backing field anywhere in
 * this codebase (no suppression list exists), so it's intentionally left out rather than faked.
 */
export function OperationsStatusRow({
  providers,
  knowledgeBaseHealthy,
  activeCampaigns,
  selectedCampaign,
  readiness,
  workflowState,
  dataMode,
}: {
  providers: ProviderHealthRow[];
  knowledgeBaseHealthy: boolean;
  activeCampaigns: Campaign[];
  /** The campaign the compact summary describes -- first Active campaign, since selection itself
   *  is a client concern owned by the Run Campaign panel below. */
  selectedCampaign: Campaign | null;
  readiness: CampaignReadiness;
  workflowState: WorkflowState | null;
  dataMode: "mock" | "google-sheets";
}) {
  const systemModules: HealthModule[] = [
    ...providers.map(toModule),
    { label: "Knowledge Base", ok: knowledgeBaseHealthy, detail: knowledgeBaseHealthy ? undefined : "Hasn't synced in the last day" },
  ];
  const systemsOk = systemModules.filter((m) => m.ok).length;

  const sendLimit = selectedCampaign?.maxLeadsPerRun ?? selectedCampaign?.dailySendLimit ?? null;
  const trackingFlags = selectedCampaign
    ? [selectedCampaign.openTrackingEnabled, selectedCampaign.clickTrackingEnabled, selectedCampaign.replyTrackingEnabled]
    : [];
  const trackingOn = trackingFlags.filter(Boolean).length;

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <ModuleCard eyebrow="System">
        <div className="space-y-1.5">
          {systemModules.map((m) => (
            <div key={m.label} className="flex items-center gap-2" title={m.detail}>
              <Dot ok={m.ok} />
              <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{m.label}</span>
              <span className={cn("shrink-0 text-[10px] font-medium", m.ok ? "text-accent" : "text-warning")}>{m.ok ? "Live" : "Down"}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 border-t border-border-subtle pt-1.5 text-[10px] text-text-tertiary">
          {systemsOk}/{systemModules.length} healthy
        </p>
      </ModuleCard>

      <ModuleCard eyebrow="Campaign">
        {selectedCampaign ? (
          <div className="space-y-1.5">
            <p className="truncate text-xs font-semibold text-text-primary">{selectedCampaign.name}</p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-tertiary">Eligible leads</span>
              <span className="font-medium text-text-primary">{readiness.campaignMatches ?? readiness.eligibleLeads}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-tertiary">Send limit</span>
              <span className="font-medium text-text-primary">{sendLimit ?? "No limit set"}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-tertiary">Status</span>
              <Badge variant={readiness.canRun ? "success" : "warning"}>{readiness.canRun ? "Ready" : "Blocked"}</Badge>
            </div>
            {activeCampaigns.length > 1 && (
              <p className="text-[10px] text-text-tertiary">+{activeCampaigns.length - 1} more active campaign{activeCampaigns.length - 1 === 1 ? "" : "s"}</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-text-tertiary">No Active campaign — activate one on the Campaigns page.</p>
        )}
      </ModuleCard>

      <ModuleCard eyebrow="Safety">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-tertiary">Tracking</span>
            <span className="font-medium text-text-primary">{selectedCampaign ? `${trackingOn}/3 enabled` : "—"}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-tertiary">Data mode</span>
            <Badge variant={selectedCampaign?.isTest ? "purple" : "outline"}>
              {selectedCampaign ? (selectedCampaign.isTest ? "Test Campaign" : "Production") : dataMode === "mock" ? "Mock data" : "Production"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-text-tertiary">Workflow</span>
            <span className="font-medium text-text-primary">{workflowState ? WORKFLOW_STATE_LABEL[workflowState] : "Unknown"}</span>
          </div>
        </div>
      </ModuleCard>
    </div>
  );
}
