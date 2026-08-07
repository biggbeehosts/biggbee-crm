"use client";

import * as React from "react";
import { Play, Pause, StepForward, BookOpen, RotateCcw, RefreshCw, Workflow, Activity, CheckCircle2, X } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconBadge } from "@/components/ui/icon-badge";
import { useAutomationStatus, useN8nAction } from "@/lib/n8n/hooks";
import type { N8nActionKey } from "@/lib/n8n/config";
import type { AutomationStatusResult, WorkflowState } from "@/lib/n8n/types";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";
import type { Campaign } from "@/types";
import { RunCampaignDialog } from "./run-campaign-dialog";
import { formatDateTime } from "@/lib/utils/date";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

const STATE_META: Record<WorkflowState, { label: string; badge: "lime" | "success" | "danger" | "outline"; dot: string; pulse?: boolean }> = {
  running: { label: "Running", badge: "lime", dot: "bg-accent-lime", pulse: true },
  idle: { label: "Idle", badge: "success", dot: "bg-success" },
  failed: { label: "Failed", badge: "danger", dot: "bg-danger" },
  unknown: { label: "Unknown", badge: "outline", dot: "bg-zinc-500" },
};

function formatRuntime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-0.5 truncate text-xs text-text-primary">{value ?? "—"}</p>
    </div>
  );
}

export type ConfiguredActions = Partial<Record<N8nActionKey, boolean>>;

/**
 * Secondary/tertiary action button. Defined at module scope (not inside the card) so React
 * keeps the same component identity across renders. An unconfigured action stays visible and
 * explains itself on click rather than surfacing a technical error.
 */
function ActionButton({
  label,
  icon: Icon,
  muted,
  isConfigured,
  busy,
  cooldown,
  disabled,
  spin,
  onClick,
}: {
  label: string;
  icon: typeof Play;
  muted?: boolean;
  isConfigured: boolean;
  busy: boolean;
  cooldown: number;
  disabled: boolean;
  spin?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant={muted ? "ghost" : "secondary"}
        onClick={onClick}
        disabled={disabled}
        className={cn(!isConfigured && "opacity-60")}
      >
        <Icon className={cn("h-3.5 w-3.5", busy && spin && "animate-spin")} />
        {busy ? "Working…" : cooldown > 0 ? `${label} (${cooldown}s)` : label}
      </Button>
      {!isConfigured && <span className="text-[10px] font-medium text-text-tertiary">Not connected</span>}
    </div>
  );
}

export function AutomationCard({
  initialStatus,
  configured,
  readiness,
  activeCampaigns,
  selectedCampaignId,
  onSelectedCampaignChange,
}: {
  initialStatus: AutomationStatusResult;
  configured: ConfiguredActions;
  readiness: CampaignReadiness;
  /** Campaigns eligible to run (status Active) -- more than one can be Active at a time, so the
   *  operator picks explicitly rather than the CRM guessing which one to send. */
  activeCampaigns: Campaign[];
  selectedCampaignId: string;
  onSelectedCampaignChange: (id: string) => void;
}) {
  const { run, pendingAction, cooldownRemaining, lastRunResult, clearLastRunResult } = useN8nAction(configured);
  const { result: statusResult, refresh: refreshStatus, refreshing: statusRefreshing } = useAutomationStatus(initialStatus);
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const status = statusResult.status;
  const meta = statusResult.configured && status ? STATE_META[status.state] : null;

  const runCooldown = cooldownRemaining("runCampaign");
  const runBusy = pendingAction === "runCampaign";
  const runDisabled = !readiness.canRun || pendingAction !== null || runCooldown > 0;

  async function confirmRun() {
    await run("runCampaign", { campaignId: selectedCampaignId });
    setConfirmOpen(false);
  }

  function handleRefreshStatus() {
    if (!statusResult.configured) {
      toast("Workflow status is not connected to n8n yet.", "error");
      return;
    }
    refreshStatus();
  }

  /** Props shared by every secondary/tertiary action button. */
  function actionProps(action: N8nActionKey | "sync", label: string) {
    const cooldown = cooldownRemaining(action);
    return {
      label,
      isConfigured: action === "sync" || configured[action] !== false,
      busy: pendingAction === action,
      cooldown,
      disabled: pendingAction !== null || cooldown > 0,
      onClick: () => run(action),
    };
  }

  return (
    <Card glow={status?.state === "running"}>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Workflow} tone="accent" />
          <div>
            <CardTitle>Automation</CardTitle>
            <CardDescription>The n8n outreach workflow — controlled from here, executed in n8n</CardDescription>
          </div>
        </div>
        {meta ? (
          <Badge variant={meta.badge}>
            <span className="relative flex h-1.5 w-1.5">
              {meta.pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", meta.dot)} />}
              <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot)} />
            </span>
            {meta.label}
          </Badge>
        ) : (
          <Badge variant="outline">{statusResult.configured ? "Status unavailable" : "Status not connected"}</Badge>
        )}
      </CardHeader>

      <div className="px-5 pb-5">
        {statusResult.error && <p className="mb-3 text-xs text-danger">{statusResult.error}</p>}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border-subtle bg-panel p-3.5 sm:grid-cols-3">
          <Field label="Last Run" value={status?.lastRun ? formatDateTime(status.lastRun) : "—"} />
          <Field label="Current Job" value={status?.currentJob ?? "—"} />
          <Field label="Current Lead" value={status?.currentLead ?? "—"} />
          <Field label="Last Success" value={status?.lastSuccess ? formatDateTime(status.lastSuccess) : "—"} />
          <Field label="Average Runtime" value={formatRuntime(status?.averageRuntimeSeconds ?? null)} />
          <Field label="Queue Size" value={status?.queueSize ?? "—"} />
        </div>

        {/* Campaign selection -- Run Campaign always requires an explicit Campaign ID; more than
            one campaign can be Active at once, so the CRM never guesses which one to send. */}
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Campaign to run</p>
          {activeCampaigns.length === 0 ? (
            <p className="text-xs text-warning">No Active campaigns — activate one on the Campaigns page before running.</p>
          ) : (
            <Select
              value={selectedCampaignId}
              onChange={(e) => onSelectedCampaignChange(e.target.value)}
              className="max-w-sm"
              disabled={pendingAction !== null}
            >
              {activeCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Primary action */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={runDisabled}>
            <Play className="h-4 w-4" />
            {runBusy ? "Starting…" : runCooldown > 0 ? `Run Campaign (${runCooldown}s)` : "Run Campaign"}
          </Button>
          {!readiness.canRun && readiness.blockReasons.length > 0 && (
            <span className="max-w-sm text-[11px] font-medium text-warning">
              {readiness.blockReasons[0]}
              {readiness.blockReasons.length > 1 ? ` (+${readiness.blockReasons.length - 1} more)` : ""}
            </span>
          )}
          {readiness.canRun && runCooldown === 0 && !runBusy && readiness.campaignMatches !== null && (
            <span className="text-[11px] text-text-tertiary">
              {readiness.campaignMatches} lead{readiness.campaignMatches === 1 ? "" : "s"} assigned by Campaign ID and eligible
            </span>
          )}
        </div>

        {/* Run result */}
        {lastRunResult?.action === "runCampaign" && (
          <div className="mt-4 rounded-xl border border-success/25 bg-success/10 p-3.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-success">Campaign started</p>
                <dl className="mt-1.5 space-y-0.5 text-[11px] text-text-secondary">
                  <div className="flex gap-1.5">
                    <dt className="text-text-tertiary">Triggered at:</dt>
                    <dd>{formatDateTime(lastRunResult.triggeredAt)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-text-tertiary">Triggered by:</dt>
                    <dd>Dashboard</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-text-tertiary">Status:</dt>
                    <dd>Accepted by n8n</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
                  Accepted does not mean sending has finished. The campaign is running in n8n — refresh the status or sync
                  the CRM shortly to see updated results.
                </p>
              </div>
              <button
                onClick={clearLastRunResult}
                className="shrink-0 rounded p-0.5 text-text-tertiary hover:text-text-primary"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Secondary actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
          <Button size="sm" variant="secondary" onClick={handleRefreshStatus} disabled={statusRefreshing || pendingAction !== null}>
            <Activity className={cn("h-3.5 w-3.5", statusRefreshing && "animate-spin")} />
            {statusRefreshing ? "Refreshing…" : "Refresh Status"}
          </Button>
          {!statusResult.configured && <span className="text-[10px] font-medium text-text-tertiary">Not connected</span>}
          <ActionButton {...actionProps("sync", "Sync CRM")} icon={RefreshCw} spin />
          <ActionButton {...actionProps("refreshKb", "Refresh Knowledge Base")} icon={BookOpen} />
        </div>

        {/* Not yet wired up — kept visible but visually de-emphasised */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ActionButton {...actionProps("pauseCampaign", "Pause")} icon={Pause} muted />
          <ActionButton {...actionProps("resumeCampaign", "Resume")} icon={StepForward} muted />
          <ActionButton {...actionProps("retryFailed", "Retry Failed Leads")} icon={RotateCcw} muted />
        </div>
      </div>

      <RunCampaignDialog open={confirmOpen} onOpenChange={setConfirmOpen} readiness={readiness} pending={runBusy} onConfirm={confirmRun} />
    </Card>
  );
}
