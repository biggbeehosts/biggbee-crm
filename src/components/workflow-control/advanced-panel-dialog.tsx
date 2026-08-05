"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, AlertTriangle, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  advancedPreviewAction,
  advancedDeployAction,
  rollbackAssignmentAction,
  type RegistryKind,
  type AdvancedPreviewResult,
} from "@/lib/actions/workflow-registry";
import { useToast } from "@/components/ui/toast";
import type { WorkflowCardModel } from "@/types";
import { formatDateTime } from "@/lib/utils/date";

/**
 * Part F -- disabled unless ADVANCED_WORKFLOW_UPDATES_ENABLED=true. Even when enabled, deploy
 * always creates a *new* n8n workflow (never overwrites in place) and requires the admin to type
 * the current workflow's name as confirmation before anything happens.
 */
export function AdvancedPanelDialog({ kind, card, advancedEnabled }: { kind: RegistryKind; card: WorkflowCardModel; advancedEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [json, setJson] = React.useState("");
  const [preview, setPreview] = React.useState<AdvancedPreviewResult | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [confirmName, setConfirmName] = React.useState("");
  const [deploying, setDeploying] = React.useState(false);
  const [rollingBack, setRollingBack] = React.useState<number | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setJson("");
      setPreview(null);
      setConfirmName("");
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    const result = await advancedPreviewAction(kind, card.id, json);
    setPreview(result);
    setPreviewing(false);
  }

  async function handleDeploy() {
    setDeploying(true);
    const result = await advancedDeployAction(kind, card.id, json, confirmName);
    setDeploying(false);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) {
      setOpen(false);
      router.refresh();
    }
  }

  async function handleRollback(index: number) {
    setRollingBack(index);
    const result = await rollbackAssignmentAction(kind, card.id, index);
    setRollingBack(null);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) router.refresh();
  }

  const canDeploy = preview?.structureValid && preview.secretFindings.length === 0 && confirmName.trim() === card.workflowName.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FlaskConical className="h-3.5 w-3.5" /> Advanced
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced workflow update</DialogTitle>
          <DialogDescription>
            Import a proposed workflow JSON, compare it to what&apos;s live, and deploy it as a brand-new n8n workflow -- never an in-place overwrite.
            The current workflow is backed up first and left untouched either way.
          </DialogDescription>
        </DialogHeader>

        {!advancedEnabled && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Advanced Workflow Update is disabled by default. Set <code className="font-mono">ADVANCED_WORKFLOW_UPDATES_ENABLED=true</code> in the environment to enable it.</p>
          </div>
        )}

        {card.versionHistory.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Version history</p>
            {card.versionHistory.map((v, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-panel p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-primary">{v.label}</p>
                  <p className="text-[11px] text-text-tertiary">
                    {formatDateTime(v.createdAt)} by {v.createdBy}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleRollback(i)} disabled={rollingBack !== null}>
                  <RotateCcw className="h-3 w-3" /> {rollingBack === i ? "Rolling back…" : "Rollback"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <fieldset disabled={!advancedEnabled} className="space-y-3 disabled:opacity-50">
          <div className="space-y-1.5">
            <Label>Proposed workflow JSON</Label>
            <Textarea rows={8} value={json} onChange={(e) => setJson(e.target.value)} placeholder="Paste the exported n8n workflow JSON here" className="font-mono text-xs" />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={handlePreview} disabled={previewing || !json.trim()}>
            {previewing ? "Comparing…" : "Compare to current"}
          </Button>

          {preview && (
            <div className="space-y-2 rounded-lg border border-border-subtle bg-panel p-3 text-xs">
              {preview.error && <p className="text-danger">{preview.error}</p>}
              {preview.structureErrors.length > 0 && (
                <div>
                  <p className="font-medium text-danger">Structure errors</p>
                  <ul className="list-inside list-disc text-text-secondary">
                    {preview.structureErrors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.secretFindings.length > 0 && (
                <div>
                  <p className="font-medium text-danger">Possible inlined secrets -- deploy blocked</p>
                  <ul className="list-inside list-disc text-text-secondary">
                    {preview.secretFindings.map((f, i) => (
                      <li key={i}>
                        {f.nodeName}.{f.parameterKey}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.diff && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="success">{preview.diff.added.length} added</Badge>
                  <Badge variant="danger">{preview.diff.removed.length} removed</Badge>
                  <Badge variant="warning">{preview.diff.modified.length} modified</Badge>
                  <Badge variant="outline">{preview.diff.unchangedCount} unchanged</Badge>
                </div>
              )}
              {preview.structureValid && preview.secretFindings.length === 0 && (
                <p className="text-success">Structurally valid and free of inlined secrets -- ready to deploy.</p>
              )}
            </div>
          )}

          {preview?.structureValid && preview.secretFindings.length === 0 && (
            <div className="space-y-1.5">
              <Label>Type the current workflow name to confirm deploy: &quot;{card.workflowName}&quot;</Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={card.workflowName} />
            </div>
          )}
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="button" size="sm" onClick={handleDeploy} disabled={!advancedEnabled || !canDeploy || deploying}>
            {deploying ? "Deploying…" : "Deploy as new version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
