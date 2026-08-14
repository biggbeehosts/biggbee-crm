"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, TriangleAlert } from "lucide-react";
import type { Campaign, DemoRecord, DemoSelectionMode, OptionLists, WebsiteRegistryEntry } from "@/types";
import { CAMPAIGN_STATUSES, DEMO_SELECTION_MODES } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveCampaignAction } from "@/lib/actions/campaigns";
import { computeDemoValidationStatus } from "@/lib/utils/cloudinary";

const DEMO_STATUS_LABEL: Record<ReturnType<typeof computeDemoValidationStatus>, string> = {
  healthy: "Healthy",
  "missing-url": "Missing URL",
  "missing-file": "Missing file",
  inactive: "Inactive",
  "invalid-mapping": "Invalid mapping",
};

/** The four wizard steps, in order -- same four sections/fields that always existed, just gated
 *  behind Next/Back instead of all being submittable from any tab. See handleNext/handleBack. */
const STEPS = ["general", "targeting", "limits", "demo"] as const;
type Step = (typeof STEPS)[number];

/** Options come from the central manageable lists (Settings → Lists), never hardcoded here.
 *  `demos` is the live Demo Library (Part C) -- selecting one persists its Demo ID, never a
 *  display name, so a demo renamed/deactivated after assignment is still caught correctly. */
export function CampaignFormDialog({
  campaign,
  options,
  demos,
  websites = [],
}: {
  campaign?: Campaign;
  options: OptionLists;
  demos: DemoRecord[];
  websites?: WebsiteRegistryEntry[];
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>("general");
  // How far the operator has already validated forward -- lets them click back to any completed
  // tab without losing data, while later tabs stay disabled until Next actually clears them.
  const [maxStepReached, setMaxStepReached] = React.useState(0);
  const [attachDemo, setAttachDemo] = React.useState(campaign?.attachDemo ?? false);
  const [demoSelectionMode, setDemoSelectionMode] = React.useState<DemoSelectionMode>(campaign?.demoSelectionMode ?? "None");
  const [demoId, setDemoId] = React.useState(campaign?.demoId ?? "");
  const [requireDemoMatch, setRequireDemoMatch] = React.useState(campaign?.requireDemoMatch ?? true);
  const [openTrackingEnabled, setOpenTrackingEnabled] = React.useState(campaign?.openTrackingEnabled ?? true);
  const [clickTrackingEnabled, setClickTrackingEnabled] = React.useState(campaign?.clickTrackingEnabled ?? true);
  const [replyTrackingEnabled, setReplyTrackingEnabled] = React.useState(campaign?.replyTrackingEnabled ?? true);
  const [deliverabilityTestEnabled, setDeliverabilityTestEnabled] = React.useState(campaign?.deliverabilityTestEnabled ?? false);
  const [isTest, setIsTest] = React.useState(campaign?.isTest ?? false);

  const selectedDemo = demos.find((d) => d.demoId === demoId);

  /** Reads a field's live DOM value straight off the (always-mounted, uncontrolled) form element
   *  -- no shadow/duplicated React state to keep in sync with it. */
  function fieldValue(name: string): string {
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return el.value;
    return "";
  }

  function focusField(name: string) {
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLElement) el.focus();
  }

  /** Per-step validation gating Next -- only checks what that step owns, never the whole
   *  campaign. The full object is validated for real by CampaignSchema when Save actually runs. */
  function validateStep(s: Step): { message: string; focus: string } | null {
    if (s === "general") {
      if (!fieldValue("name").trim()) return { message: "Campaign name is required.", focus: "name" };
      return null;
    }
    if (s === "targeting") {
      const raw = fieldValue("minConfidence").trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 100) return { message: "Minimum confidence must be a number between 0 and 100.", focus: "minConfidence" };
      }
      return null;
    }
    if (s === "limits") {
      for (const [name, label] of [
        ["maxLeadsPerRun", "Max leads per run"],
        ["dailySendLimit", "Daily send limit"],
      ] as const) {
        const raw = fieldValue(name).trim();
        if (raw) {
          const n = Number(raw);
          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return { message: `${label} must be a positive whole number.`, focus: name };
        }
      }
      return null;
    }
    return null;
  }

  function handleNext() {
    const invalid = validateStep(step);
    if (invalid) {
      setError(invalid.message);
      focusField(invalid.focus);
      return;
    }
    setError(null);
    const idx = STEPS.indexOf(step);
    const next = STEPS[idx + 1];
    setStep(next);
    setMaxStepReached((m) => Math.max(m, idx + 1));
  }

  function handleBack() {
    setError(null);
    const idx = STEPS.indexOf(step);
    setStep(STEPS[idx - 1]);
  }

  /** Belt-and-suspenders: Save only ever renders as a submit button on the final step, so Enter
   *  has no submit target to trigger on earlier steps -- this just blocks it explicitly too. */
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && step !== "demo" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  }

  async function handleSubmit(formData: FormData) {
    if (pending) return;
    formData.set("attachDemo", attachDemo ? "true" : "false");
    formData.set("demoSelectionMode", attachDemo ? demoSelectionMode : "None");
    formData.set("demoId", demoSelectionMode === "Exact" ? demoId : "");
    formData.set("requireDemoMatch", requireDemoMatch ? "true" : "false");
    formData.set("openTrackingEnabled", openTrackingEnabled ? "true" : "false");
    formData.set("clickTrackingEnabled", clickTrackingEnabled ? "true" : "false");
    formData.set("replyTrackingEnabled", replyTrackingEnabled ? "true" : "false");
    formData.set("deliverabilityTestEnabled", deliverabilityTestEnabled ? "true" : "false");
    formData.set("isTest", isTest ? "true" : "false");

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
        <form ref={formRef} action={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-4">
          {campaign && <input type="hidden" name="id" value={campaign.id} />}

          <Tabs value={step} onValueChange={(v) => { setError(null); setStep(v as Step); }}>
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="targeting" disabled={maxStepReached < 1}>Targeting</TabsTrigger>
              <TabsTrigger value="limits" disabled={maxStepReached < 2}>Sending Limits</TabsTrigger>
              <TabsTrigger value="demo" disabled={maxStepReached < 3}>Demo &amp; Tracking</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* All four sections stay mounted at all times (never conditionally removed from the
              DOM) so every field is always present in the form's FormData regardless of which
              step is visually active -- see saveCampaignAction's CampaignSchema.parse for why a
              field silently missing from FormData used to surface as "expected string, received
              null". Only CSS visibility toggles between steps; nothing here duplicates state,
              resyncs via useEffect, or resets on navigation. */}
          <div className={step === "general" ? "space-y-3" : "hidden"}>
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Campaign name *</Label>
                <Input id="c-name" name="name" required defaultValue={campaign?.name} placeholder="UK Instagram Agencies" />
              </div>
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
                <Label htmlFor="c-notes">Notes</Label>
                <Textarea id="c-notes" name="notes" rows={3} defaultValue={campaign?.notes} placeholder="Target agencies running Instagram lead generation campaigns." />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border-subtle p-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">Test Campaign</p>
                  <p className="text-xs text-text-tertiary">
                    Leads scraped under this campaign are tagged as test data and excluded from production analytics by default.
                  </p>
                </div>
                <Switch checked={isTest} onCheckedChange={setIsTest} aria-label="Test campaign" />
              </div>
          </div>

          <div className={step === "targeting" ? "space-y-3" : "hidden"}>
              <p className="text-xs text-text-tertiary">
                Country, Industry, Business Type, and Lead Generation Type describe <strong>who</strong> this campaign targets -- leave any
                field on &quot;Any&quot; to skip that criterion. A lead must match every targeting field you set (equivalent categories like
                &quot;Dentist&quot; and &quot;Dental Clinic&quot; are recognized as the same) to be eligible for a run.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SelectField label="Country" name="country" defaultValue={campaign?.country} items={enabled("countries").map((o) => o.label)} />
                <SelectField label="Industry" name="industry" defaultValue={campaign?.industry} items={enabled("industries").map((o) => o.label)} />
                <SelectField label="Business Type" name="businessType" defaultValue={campaign?.businessType} items={enabled("businessTypes").map((o) => o.label)} />
                <SelectField
                  label="Service to Offer"
                  name="service"
                  defaultValue={campaign?.service}
                  items={enabled("services").map((o) => o.label)}
                  hint="What Biggbee will pitch -- leads don't need this already, it's never used to filter who qualifies."
                />
                <SelectField
                  label="Lead Generation Type"
                  name="leadGenerationType"
                  defaultValue={campaign?.leadGenerationType}
                  items={enabled("leadGenerationTypes").map((o) => o.label)}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="c-conf">Minimum confidence (%)</Label>
                  <Input id="c-conf" name="minConfidence" type="number" min={0} max={100} defaultValue={campaign?.minConfidence ?? ""} placeholder="70" />
                </div>
              </div>
          </div>

          <div className={step === "limits" ? "space-y-3" : "hidden"}>
              <p className="text-xs text-text-tertiary">
                The workflow enforces these caps when it runs -- leave blank for no limit.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-max">Max leads per run</Label>
                  <Input id="c-max" name="maxLeadsPerRun" type="number" min={1} defaultValue={campaign?.maxLeadsPerRun ?? ""} placeholder="50" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-daily">Daily send limit</Label>
                  <Input id="c-daily" name="dailySendLimit" type="number" min={1} defaultValue={campaign?.dailySendLimit ?? ""} placeholder="200" />
                </div>
              </div>
          </div>

          <div className={step === "demo" ? "space-y-3" : "hidden"}>
              <div className="space-y-3 rounded-xl border border-border-subtle p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Attach demo</p>
                    <p className="text-xs text-text-tertiary">Off disables demo attachment entirely, regardless of mode below.</p>
                  </div>
                  <Switch checked={attachDemo} onCheckedChange={setAttachDemo} aria-label="Attach demo" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-demo-mode">Demo selection mode</Label>
                    <Select
                      id="c-demo-mode"
                      value={demoSelectionMode}
                      onChange={(e) => setDemoSelectionMode(e.target.value as DemoSelectionMode)}
                      disabled={!attachDemo}
                    >
                      {DEMO_SELECTION_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-end justify-between gap-2 pb-1">
                    <div>
                      <p className="text-xs font-medium text-text-primary">Require demo match</p>
                      <p className="text-[11px] text-text-tertiary">Automatic mode with no match blocks the run instead of sending without one.</p>
                    </div>
                    <Switch checked={requireDemoMatch} onCheckedChange={setRequireDemoMatch} disabled={!attachDemo} aria-label="Require demo match" />
                  </div>
                </div>

                {attachDemo && demoSelectionMode === "Exact" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="c-demo-id">Demo</Label>
                    <Select id="c-demo-id" value={demoId} onChange={(e) => setDemoId(e.target.value)}>
                      <option value="">Select a demo…</option>
                      {demos.map((d) => {
                        const status = computeDemoValidationStatus(d);
                        const selectable = status === "healthy" || status === "missing-file";
                        return (
                          <option key={d.demoId} value={d.demoId} disabled={!selectable && d.demoId !== campaign?.demoId}>
                            {d.name || d.demoType} — {d.demoType}
                            {d.service ? ` · ${d.service}` : ""} ({DEMO_STATUS_LABEL[status]})
                          </option>
                        );
                      })}
                    </Select>
                    {selectedDemo ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <Badge variant="outline">{selectedDemo.demoId}</Badge>
                        <Badge variant="outline">{selectedDemo.demoType}</Badge>
                        {selectedDemo.service && <Badge variant="outline">{selectedDemo.service}</Badge>}
                        <Badge variant={computeDemoValidationStatus(selectedDemo) === "healthy" ? "success" : "warning"}>
                          {DEMO_STATUS_LABEL[computeDemoValidationStatus(selectedDemo)]}
                        </Badge>
                        <Badge variant={selectedDemo.publicWatchUrl ? "success" : "warning"}>
                          {selectedDemo.publicWatchUrl ? "Attachment available" : "No attachment"}
                        </Badge>
                      </div>
                    ) : demoId ? (
                      <p className="flex items-center gap-1 text-[11px] text-danger">
                        <TriangleAlert className="h-3 w-3" /> Selected demo &quot;{demoId}&quot; was not found in the Demo Library.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 rounded-xl border border-border-subtle p-3">
                <Label htmlFor="c-website">Website / Knowledge Base</Label>
                <Select id="c-website" name="websiteId" defaultValue={campaign?.websiteId ?? ""}>
                  <option value="">Default (Biggbees.com)</option>
                  {websites
                    .filter((w) => w.active)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                </Select>
                <p className="text-xs text-text-tertiary">
                  When set, outreach uses that site&apos;s synced Knowledge Base instead of the default -- see Automation Hub &rarr; Knowledge Base.
                </p>
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
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            {step === "general" && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleNext}>
                  Next: Targeting →
                </Button>
              </>
            )}
            {step === "targeting" && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={handleBack}>
                  ← Back
                </Button>
                <Button type="button" size="sm" onClick={handleNext}>
                  Next: Sending Limits →
                </Button>
              </>
            )}
            {step === "limits" && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={handleBack}>
                  ← Back
                </Button>
                <Button type="button" size="sm" onClick={handleNext}>
                  Next: Demo &amp; Tracking →
                </Button>
              </>
            )}
            {step === "demo" && (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={handleBack}>
                  ← Back
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Saving…" : "Save campaign"}
                </Button>
              </>
            )}
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

function SelectField({
  label,
  name,
  defaultValue,
  items,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  items: string[];
  hint?: string;
}) {
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
      {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  );
}
