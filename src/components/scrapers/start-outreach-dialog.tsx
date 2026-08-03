"use client";

import * as React from "react";
import { Send, TriangleAlert } from "lucide-react";
import type { Campaign, Lead } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { summarizeCampaignMatch } from "@/lib/calculations/campaign-match";
import { useN8nAction } from "@/lib/n8n/hooks";
import { useToast } from "@/components/ui/toast";

/**
 * Safe outreach handoff (Part H): a deliberately separate action from scraping itself. Approving
 * leads on the Scraped Leads page never sends anything on its own -- this is the only door into
 * the existing Run Campaign webhook, and it always requires an explicit campaign + confirmation.
 */
export function StartOutreachDialog({ campaigns, leads, runCampaignConfigured = true }: { campaigns: Campaign[]; leads: Lead[]; runCampaignConfigured?: boolean }) {
  const { run, pendingAction } = useN8nAction({ runCampaign: runCampaignConfigured });
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [campaignId, setCampaignId] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const summary = campaign ? summarizeCampaignMatch(leads, campaign) : null;
  const pending = pendingAction === "runCampaign";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCampaignId("");
      setConfirmed(false);
    }
  }

  async function handleConfirm() {
    if (!campaign || !summary || summary.matching === 0 || !confirmed) return;
    await run("runCampaign", { campaignId: campaign.id });
    toast(`Outreach started for ${campaign.name}.`, "success");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Send className="h-3.5 w-3.5" /> Start Campaign Outreach
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Campaign Outreach</DialogTitle>
          <DialogDescription>
            Sends the existing Run Campaign webhook — n8n selects only <strong>approved (Status = New)</strong> leads assigned to the campaign you pick
            below. Scraping never triggers this on its own.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="outreach-campaign">Campaign *</Label>
            <Select id="outreach-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Select a campaign…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </Select>
          </div>

          {campaign && summary && (
            <>
              {campaign.status !== "Active" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/10 p-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-xs leading-relaxed text-warning">
                    &quot;{campaign.name}&quot; is {campaign.status}, not Active — n8n will reject this run until it&apos;s activated.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border-subtle bg-panel p-3">
                  <p className="text-[11px] font-medium text-text-tertiary">Ready to send (New)</p>
                  <p className="mt-0.5 text-xl font-semibold text-text-primary">{summary.matching}</p>
                </div>
                <div className="rounded-xl border border-border-subtle bg-panel p-3">
                  <p className="text-[11px] font-medium text-text-tertiary">Max leads per run</p>
                  <p className="mt-0.5 text-xl font-semibold text-text-primary">{campaign.maxLeadsPerRun ?? "No cap"}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border-subtle bg-panel p-3">
                <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Excluded from this run</p>
                <ul className="space-y-0.5 text-xs text-text-secondary">
                  <li>Not New / stopped status: {summary.excludedByStatus}</li>
                  <li>Already contacted: {summary.alreadyContacted}</li>
                  <li>Below confidence floor: {summary.belowConfidence}</li>
                  <li>Missing website (informational): {summary.missingWebsite}</li>
                </ul>
              </div>

              <p className="text-xs text-text-secondary">
                {summary.matching} of {summary.assigned} assigned lead{summary.assigned === 1 ? "" : "s"} have a demo status of{" "}
                {leads.filter((l) => l.campaignId === campaign.id && l.demoRecommended).length} recommended.
              </p>

              <label className="flex items-start gap-2 text-xs text-text-secondary">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(Boolean(v))} className="mt-0.5" />
                <span>
                  I understand this sends <strong>real outreach</strong> to the {summary.matching} lead{summary.matching === 1 ? "" : "s"} above and
                  cannot be undone once n8n starts.
                </span>
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={!campaign || !summary || summary.matching === 0 || !confirmed || pending || campaign.status !== "Active"}
          >
            <Send className="h-3.5 w-3.5" />
            {pending ? "Starting…" : "Confirm and send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
