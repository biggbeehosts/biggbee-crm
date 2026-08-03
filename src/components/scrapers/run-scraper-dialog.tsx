"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import type { Campaign, ScraperAgent } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DynamicForm, defaultsForSchema, type DynamicFormValues } from "./dynamic-form";
import { startScrapingJobAction } from "@/lib/actions/scrapers";
import { useToast } from "@/components/ui/toast";

/** Keys every seeded schema carries that map onto the run payload's own top-level fields rather
 *  than its `inputs` bag -- see src/types/scraper.ts's ScraperRunPayload. */
const RESERVED_KEYS = new Set(["campaignId", "requestedCount"]);

export function RunScraperDialog({ agent, campaigns, countries }: { agent: ScraperAgent; campaigns: Campaign[]; countries: string[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<DynamicFormValues>(() => defaultsForSchema(agent.formSchema));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValues(defaultsForSchema(agent.formSchema));
  }

  function onChange(key: string, value: string | number | boolean | string[]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const campaignId = String(values.campaignId ?? "").trim();
    if (!campaignId) {
      setError("Select a campaign to run.");
      return;
    }
    const requestedCount = Number(values.requestedCount);
    if (!Number.isFinite(requestedCount) || requestedCount < 1) {
      setError("Enter how many leads/profiles to request.");
      return;
    }
    if (requestedCount > agent.maxAllowedLeads) {
      setError(`${agent.name} allows at most ${agent.maxAllowedLeads} per run.`);
      return;
    }

    const inputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!RESERVED_KEYS.has(key)) inputs[key] = value;
    }

    setPending(true);
    const result = await startScrapingJobAction(agent.id, campaignId, requestedCount, inputs);
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
        <Button size="sm" disabled={agent.status !== "Active"}>
          <Play className="h-3.5 w-3.5" /> Open Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Run {agent.name}</DialogTitle>
          <DialogDescription>
            Scraped results land in the Leads sheet as Status = Staged, tagged with this Campaign ID and a new Scraper Job ID — nothing is sent
            automatically. Review them on the Scraped Leads page before approving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <DynamicForm schema={agent.formSchema} values={values} onChange={onChange} countries={countries} campaigns={campaigns} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Running…" : "Start scrape"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
