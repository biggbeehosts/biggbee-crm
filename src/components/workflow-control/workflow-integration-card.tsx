"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Activity, BookOpen, MessageCircle, ExternalLink, Power, PowerOff, RefreshCw, Wifi, Download, Copy, FileJson, Hash, Timer } from "lucide-react";
import type { Campaign, Lead, WorkflowCardModel } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { downloadTextFile } from "@/lib/utils/csv";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/toast";
import { useN8nAction } from "@/lib/n8n/hooks";
import {
  testConnectionAction,
  refreshMetadataAction,
  activateWorkflowAction,
  deactivateWorkflowAction,
  downloadBackupAction,
  duplicateWorkflowAction,
  exportWorkflowDownloadAction,
  type RegistryKind,
} from "@/lib/actions/workflow-registry";
import { SchemaDialog } from "./schema-dialog";
import { ExecutionsDrawer } from "./executions-drawer";
import { ContractValidationDialog } from "./contract-validation-dialog";
import { ReplaceAssignmentDialog } from "./replace-assignment-dialog";
import { AdvancedPanelDialog } from "./advanced-panel-dialog";
import { StartOutreachDialog } from "./start-outreach-dialog";

const PURPOSE_ICON = { Outreach: Send, Status: Activity, "Knowledge Base": BookOpen, "Reply Processing": MessageCircle } as const;

const CONNECTION_VARIANT = { connected: "lime", error: "danger", unknown: "outline", unconfigured: "warning" } as const;

function formatRuntime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function WorkflowIntegrationCard({
  kind,
  card,
  n8nEditorUrl,
  advancedEnabled,
  outreachExtras,
  kbSyncConfigured,
}: {
  kind: RegistryKind;
  card: WorkflowCardModel;
  n8nEditorUrl: string | null;
  advancedEnabled: boolean;
  /** "Run" for the Outreach card -- the campaign-gated StartOutreachDialog; never a bare trigger. */
  outreachExtras?: { campaigns: Campaign[]; leads: Lead[]; runCampaignConfigured: boolean };
  /** "Sync" for the Knowledge Base card -- reuses the existing refreshKb webhook action, undefined
   *  when this card isn't the Knowledge Base purpose. */
  kbSyncConfigured?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<string | null>(null);
  const { run: runN8nAction, pendingAction: kbPendingAction } = useN8nAction({ refreshKb: kbSyncConfigured });
  const Icon = PURPOSE_ICON[card.purpose];

  async function run(actionName: string, fn: () => Promise<{ success: boolean; message: string }>) {
    setPending(actionName);
    const result = await fn();
    setPending(null);
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
  }

  async function exportDownload() {
    setPending("export");
    const result = await exportWorkflowDownloadAction(kind, card.id);
    setPending(null);
    if (!result.success || !result.json || !result.fileName) {
      toast(result.message, "error");
      return;
    }
    downloadTextFile(result.fileName, result.json);
    toast(result.message, "success");
  }

  return (
    <Card
      id={kind === "integration" ? card.purpose.toLowerCase().replace(/\s+/g, "-") : undefined}
      level={2}
      glow={card.active && card.connectionStatus === "connected"}
      className="flex scroll-mt-20 flex-col gap-3.5 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.active ? "bg-accent-lime-soft text-accent-lime" : "bg-panel text-text-tertiary")}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{card.displayName}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{card.purpose}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant={card.active ? "lime" : "outline"}>{card.active ? "Active" : "Inactive"}</Badge>
          <Badge variant={CONNECTION_VARIANT[card.connectionStatus]}>{card.connectionStatus}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-panel px-3 py-2.5 text-xs">
        <div>
          <p className="text-text-tertiary">n8n workflow ID</p>
          <p className="truncate font-mono text-text-secondary" title={card.n8nWorkflowId}>
            {card.n8nWorkflowId || "—"}
          </p>
        </div>
        <div>
          <p className="text-text-tertiary">Webhook / reference</p>
          <p className="truncate font-mono text-text-secondary" title={card.webhookPath}>
            {card.webhookPath}
          </p>
        </div>
        <div>
          <p className="text-text-tertiary">Last verified</p>
          <p className="text-text-secondary" title={card.lastVerifiedAt ? formatDateTime(card.lastVerifiedAt) : undefined}>
            {card.lastVerifiedAt ? formatRelativeTime(card.lastVerifiedAt) : "Never"}
          </p>
        </div>
        <div>
          <p className="text-text-tertiary">Version hash</p>
          <p className="truncate font-mono text-text-secondary">{card.currentVersionHash ?? "—"}</p>
        </div>
        <div>
          <p className="text-text-tertiary">Last deployment</p>
          <p className="text-text-secondary" title={card.n8nUpdatedAt ? formatDateTime(card.n8nUpdatedAt) : undefined}>
            {card.n8nUpdatedAt ? formatRelativeTime(card.n8nUpdatedAt) : "—"}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-text-tertiary">
            <Hash className="h-3 w-3" /> Executions
          </p>
          <p className="text-text-secondary">{card.executionCount ?? "—"}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-text-tertiary">
            <Timer className="h-3 w-3" /> Avg runtime
          </p>
          <p className="text-text-secondary">{formatRuntime(card.averageRuntimeSeconds)}</p>
        </div>
        <div>
          <p className="text-text-tertiary">Last success</p>
          <p className="text-text-secondary" title={card.lastSuccessfulExecution ? formatDateTime(card.lastSuccessfulExecution) : undefined}>
            {card.lastSuccessfulExecution ? formatRelativeTime(card.lastSuccessfulExecution) : "—"}
          </p>
        </div>
        <div>
          <p className="text-text-tertiary">Last failure</p>
          <p className={cn("text-text-secondary", card.lastFailedExecution && "text-danger")} title={card.lastFailedExecution ? formatDateTime(card.lastFailedExecution) : undefined}>
            {card.lastFailedExecution ? formatRelativeTime(card.lastFailedExecution) : "—"}
          </p>
        </div>
      </div>

      <p className="text-xs text-text-tertiary">{card.linkedLabel}</p>

      {card.lastErrorSummary && <p className="rounded-md bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{card.lastErrorSummary}</p>}

      {!card.configHealthy && (
        <div className="rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          <p className="font-medium">Configuration health: needs attention</p>
          <ul className="mt-1 list-inside list-disc">
            {card.configIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {card.configHealthy && <p className="text-xs text-success">Configuration health: OK</p>}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-3">
        <Button variant="ghost" size="sm" onClick={() => run("test", () => testConnectionAction(kind, card.id))} disabled={pending !== null}>
          <Wifi className="h-3.5 w-3.5" /> {pending === "test" ? "Testing…" : "Test Connection"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => run("refresh", () => refreshMetadataAction(kind, card.id))} disabled={pending !== null}>
          <RefreshCw className="h-3.5 w-3.5" /> {pending === "refresh" ? "Refreshing…" : "Refresh Metadata"}
        </Button>
        <ExecutionsDrawer kind={kind} id={card.id} n8nEditorUrl={n8nEditorUrl} />
        {n8nEditorUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={n8nEditorUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open in n8n
            </a>
          </Button>
        )}
        <ContractValidationDialog kind={kind} id={card.id} />
        <SchemaDialog inputSchema={card.expectedInputSchema} outputSchema={card.expectedOutputSchema} />
        {card.purpose === "Outreach" && outreachExtras && (
          <StartOutreachDialog campaigns={outreachExtras.campaigns} leads={outreachExtras.leads} runCampaignConfigured={outreachExtras.runCampaignConfigured} />
        )}
        {card.purpose === "Knowledge Base" && kbSyncConfigured !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => runN8nAction("refreshKb")} disabled={kbPendingAction !== null || !kbSyncConfigured}>
            <RefreshCw className={kbPendingAction === "refreshKb" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> {kbPendingAction === "refreshKb" ? "Syncing…" : "Sync"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => run("backup", () => downloadBackupAction(kind, card.id))} disabled={pending !== null}>
          <Download className="h-3.5 w-3.5" /> {pending === "backup" ? "Backing up…" : "Download Backup"}
        </Button>
        <Button variant="ghost" size="sm" onClick={exportDownload} disabled={pending !== null}>
          <FileJson className="h-3.5 w-3.5" /> {pending === "export" ? "Exporting…" : "Export"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => run("duplicate", () => duplicateWorkflowAction(kind, card.id))}
          disabled={pending !== null || !card.n8nWorkflowId.trim()}
        >
          <Copy className="h-3.5 w-3.5" /> {pending === "duplicate" ? "Duplicating…" : "Duplicate"}
        </Button>
        <ReplaceAssignmentDialog kind={kind} card={card} />
        <AdvancedPanelDialog kind={kind} card={card} advancedEnabled={advancedEnabled} />

        <div className="ml-auto flex items-center gap-1.5">
          {card.active ? (
            <Button variant="ghost" size="sm" onClick={() => run("deactivate", () => deactivateWorkflowAction(kind, card.id))} disabled={pending !== null}>
              <PowerOff className="h-3.5 w-3.5" /> Deactivate
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => run("activate", () => activateWorkflowAction(kind, card.id))} disabled={pending !== null}>
              <Power className="h-3.5 w-3.5" /> Activate
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
