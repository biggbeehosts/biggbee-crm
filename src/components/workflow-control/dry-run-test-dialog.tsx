"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TestTube2 } from "lucide-react";
import type { Campaign, ScraperAgent } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DynamicForm, defaultsForSchema, type DynamicFormValues } from "@/components/scrapers/dynamic-form";
import { dryRunScraperTestAction } from "@/lib/actions/scrapers";
import { useToast } from "@/components/ui/toast";

const RESERVED_KEYS = new Set(["campaignId", "requestedCount"]);

/**
 * Part C/J.10: "test using a maximum one-result dry run." Reuses the same call path as a real
 * scraper run, but the server action (dryRunScraperTestAction) always clamps requestedCount to 1
 * regardless of what's shown here -- requestedCount is hidden entirely so there's no way to ask
 * for more from this dialog.
 */
export function DryRunTestDialog({ agent, campaigns, countries }: { agent: ScraperAgent; campaigns: Campaign[]; countries: string[] }) {
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
      setError("Select a campaign to test against.");
      return;
    }
    const inputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (!RESERVED_KEYS.has(key)) inputs[key] = value;
    }
    setPending(true);
    const result = await dryRunScraperTestAction(agent.id, campaignId, inputs);
    setPending(false);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <TestTube2 className="h-3.5 w-3.5" /> One-Result Dry Test
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>One-result dry test — {agent.name}</DialogTitle>
          <DialogDescription>
            Always requests exactly 1 result, regardless of any count you enter elsewhere -- confirms the contract end-to-end (input accepted,
            output shape returned) without importing a meaningful batch of leads. Recorded in Scraping Jobs, labeled as a dry run.
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
              {pending ? "Testing…" : "Run one-result test"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
