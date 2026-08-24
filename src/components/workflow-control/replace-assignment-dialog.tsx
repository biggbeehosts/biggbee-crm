"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Replace } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { replaceAssignmentAction, type RegistryKind } from "@/lib/actions/workflow-registry";
import { useToast } from "@/components/ui/toast";
import type { WorkflowCardModel } from "@/types";

/**
 * Replacing a workflow assignment never edits or deletes the previous n8n workflow -- this only
 * moves the CRM's own pointer, and the server action resets connectionStatus so the new
 * assignment can't be enabled until Validate Contract passes.
 */
export function ReplaceAssignmentDialog({ kind, card }: { kind: RegistryKind; card: WorkflowCardModel }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [workflowId, setWorkflowId] = React.useState(card.n8nWorkflowId);
  const [webhook, setWebhook] = React.useState("");
  const [workflowName, setWorkflowName] = React.useState(card.workflowName);
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setWorkflowId(card.n8nWorkflowId);
      setWebhook("");
      setWorkflowName(card.workflowName);
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!workflowId.trim()) {
      setError("n8n workflow ID is required.");
      return;
    }
    if (!webhook.trim()) {
      setError("Webhook path or URL is required.");
      return;
    }
    setPending(true);
    const result = await replaceAssignmentAction(kind, card.id, {
      n8nWorkflowId: workflowId.trim(),
      webhookPathOrEnvVar: webhook.trim(),
      useEnvVar: false,
      workflowName: workflowName.trim() || undefined,
    });
    setPending(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    toast(result.message, "success");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Replace className="h-3.5 w-3.5" /> Replace Assignment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Replace workflow assignment</DialogTitle>
          <DialogDescription>
            Points this integration at a different n8n workflow/webhook. The workflow it currently points at is never edited or deleted -- it&apos;s
            just left behind. The new assignment cannot be enabled until it passes Validate Contract.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>New n8n workflow ID</Label>
            <Input value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} placeholder="e.g. AbCdEfGhIjKlMnOp" />
          </div>
          <div className="space-y-1.5">
            <Label>Workflow display name</Label>
            <Input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} placeholder="e.g. Outbound Cold Email System v2" />
          </div>
          <div className="space-y-1.5">
            <Label>Webhook path or full URL</Label>
            <Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="webhook/biggbee/run-campaign" />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Replace assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
