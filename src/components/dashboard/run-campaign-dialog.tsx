"use client";

import * as React from "react";
import { Play, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";

/**
 * Confirmation gate for the only action that sends real outreach. Deliberately shows no
 * technical detail (no webhook URL, no action key) -- just what the operator needs to decide.
 */
export function RunCampaignDialog({
  open,
  onOpenChange,
  readiness,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readiness: CampaignReadiness;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Campaign</DialogTitle>
          <DialogDescription>Starts the outbound campaign in n8n.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/10 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-warning">
              This can send <strong>real outreach emails to real prospects</strong>. It cannot be undone once n8n starts sending.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border-subtle bg-panel p-3">
              <p className="text-[11px] font-medium text-text-tertiary">Eligible leads</p>
              <p className="mt-0.5 text-xl font-semibold text-text-primary">{readiness.eligibleLeads}</p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-panel p-3">
              <p className="text-[11px] font-medium text-text-tertiary">Campaign</p>
              <p className="mt-0.5 truncate text-sm font-medium text-text-primary">
                {readiness.activeCampaignName ?? "No active campaign"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-text-tertiary">Targeting</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {readiness.targetingSummary ?? "No targeting selected."}
            </p>
            {readiness.campaignMatches !== null && (
              <p className="mt-1 text-[11px] text-text-tertiary">
                {readiness.campaignMatches} of {readiness.eligibleLeads} eligible leads match this targeting.
              </p>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-text-tertiary">
            Campaign targeting is a planning view inside the CRM — it does not restrict this run. n8n selects leads
            itself and will process all <strong>{readiness.eligibleLeads}</strong> eligible. It also applies its own
            daily send cap and follow-up rules, so the number actually contacted may be lower.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={pending}>
            <Play className="h-3.5 w-3.5" />
            {pending ? "Starting…" : "Confirm and Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
