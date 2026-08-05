"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import type { Campaign, OptionLists } from "@/types";
import { CAMPAIGN_STATUSES } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveCampaignAction } from "@/lib/actions/campaigns";

/** Options come from the central manageable lists (Settings → Lists), never hardcoded here. */
export function CampaignFormDialog({ campaign, options }: { campaign?: Campaign; options: OptionLists }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [openTrackingEnabled, setOpenTrackingEnabled] = React.useState(campaign?.openTrackingEnabled ?? true);
  const [clickTrackingEnabled, setClickTrackingEnabled] = React.useState(campaign?.clickTrackingEnabled ?? true);
  const [replyTrackingEnabled, setReplyTrackingEnabled] = React.useState(campaign?.replyTrackingEnabled ?? true);
  const [deliverabilityTestEnabled, setDeliverabilityTestEnabled] = React.useState(campaign?.deliverabilityTestEnabled ?? false);

  async function handleSubmit(formData: FormData) {
    formData.set("openTrackingEnabled", openTrackingEnabled ? "true" : "false");
    formData.set("clickTrackingEnabled", clickTrackingEnabled ? "true" : "false");
    formData.set("replyTrackingEnabled", replyTrackingEnabled ? "true" : "false");
    formData.set("deliverabilityTestEnabled", deliverabilityTestEnabled ? "true" : "false");

    setPending(true);
    setError(null);
    const result = await saveCampaignAction(formData);
    setPending(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const enabled = (key: keyof OptionLists) => options[key].filter((o) => o.enabled);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {campaign ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" /> New Campaign
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>
            Campaigns define what the outreach workflow should target. Saving here never sends emails -- it only prepares and previews the lead selection.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          {campaign && <input type="hidden" name="id" value={campaign.id} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-name">Campaign name *</Label>
              <Input id="c-name" name="name" required defaultValue={campaign?.name} placeholder="UK Instagram Agencies" />
            </div>

            <SelectField label="Country" name="country" defaultValue={campaign?.country} items={enabled("countries").map((o) => o.label)} />
            <SelectField label="Industry" name="industry" defaultValue={campaign?.industry} items={enabled("industries").map((o) => o.label)} />
            <SelectField label="Business Type" name="businessType" defaultValue={campaign?.businessType} items={enabled("businessTypes").map((o) => o.label)} />
            <SelectField label="Service" name="service" defaultValue={campaign?.service} items={enabled("services").map((o) => o.label)} />
            <SelectField
              label="Lead Generation Type"
              name="leadGenerationType"
              defaultValue={campaign?.leadGenerationType}
              items={enabled("leadGenerationTypes").map((o) => o.label)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="c-status">Status</Label>
              <Select id="c-status" name="status" defaultValue={campaign?.status ?? "Draft"}>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-conf">Minimum confidence (%)</Label>
              <Input id="c-conf" name="minConfidence" type="number" min={0} max={100} defaultValue={campaign?.minConfidence ?? ""} placeholder="70" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-max">Max leads per run</Label>
              <Input id="c-max" name="maxLeadsPerRun" type="number" min={1} defaultValue={campaign?.maxLeadsPerRun ?? ""} placeholder="50" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-daily">Daily send limit</Label>
              <Input id="c-daily" name="dailySendLimit" type="number" min={1} defaultValue={campaign?.dailySendLimit ?? ""} placeholder="200" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea id="c-notes" name="notes" rows={2} defaultValue={campaign?.notes} placeholder="Target agencies running Instagram lead generation campaigns." />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border-subtle p-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Tracking</p>
              <p className="text-xs text-text-tertiary">
                Open/click tracking add a pixel and wrapped links to this campaign&apos;s emails. Estimated only -- see Analytics for limitations.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <ToggleRow label="Open tracking" checked={openTrackingEnabled} onCheckedChange={setOpenTrackingEnabled} />
              <ToggleRow label="Click tracking" checked={clickTrackingEnabled} onCheckedChange={setClickTrackingEnabled} />
              <ToggleRow label="Reply tracking" checked={replyTrackingEnabled} onCheckedChange={setReplyTrackingEnabled} />
              <ToggleRow
                label="Deliverability testing"
                hint="Manual inbox-placement tests only, unless a provider is connected."
                checked={deliverabilityTestEnabled}
                onCheckedChange={setDeliverabilityTestEnabled}
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-panel px-2.5 py-2">
      <div>
        <p className="text-xs font-medium text-text-primary">{label}</p>
        {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function SelectField({ label, name, defaultValue, items }: { label: string; name: string; defaultValue?: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`c-${name}`}>{label}</Label>
      <Select id={`c-${name}`} name={name} defaultValue={defaultValue ?? ""}>
        <option value="">Any</option>
        {items.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </Select>
    </div>
  );
}
