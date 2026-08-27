"use client";

import Link from "next/link";
import { UserPlus, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";

/**
 * Shown when Run Campaign is clicked but a non-infrastructure precondition isn't met yet -- no
 * campaign selected, or no eligible leads. These are expected first-run states, not failures
 * (Section 7/22 of the final polish brief), so this is guidance with a next step, never phrased
 * as an error and never logged as one.
 */
export function RunCampaignGuidanceDialog({
  open,
  onOpenChange,
  readiness,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readiness: CampaignReadiness;
}) {
  const noCampaignSelected = !readiness.selectedCampaignName;
  const noEligibleLeads = !noCampaignSelected && (readiness.eligibleLeads === 0 || readiness.campaignMatches === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{noCampaignSelected ? "Select a campaign to continue" : "No eligible leads yet"}</DialogTitle>
          <DialogDescription>
            {noCampaignSelected
              ? "Run Campaign needs a campaign selected above before it can check what's ready to send."
              : noEligibleLeads
                ? "No eligible leads are available for this campaign yet. Add some leads, then try again."
                : (readiness.blockReasons[0] ?? "This campaign isn't ready to run yet.")}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          {noEligibleLeads && (
            <Button size="sm" variant="secondary" asChild>
              <Link href="/leads">
                <UserPlus className="h-3.5 w-3.5" /> Add Leads
              </Link>
            </Button>
          )}
          {noCampaignSelected && (
            <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
              <ListChecks className="h-3.5 w-3.5" /> Choose Campaign
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="sm:ml-auto">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
