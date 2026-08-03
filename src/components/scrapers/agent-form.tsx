"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2 } from "lucide-react";
import type { ScraperAgent, ScraperFieldType, ScraperFormField } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { createScraperAgentAction, updateScraperAgentAction } from "@/lib/actions/scrapers";
import { useToast } from "@/components/ui/toast";
import { SCRAPER_ICON_NAMES } from "./icon-map";

const FIELD_TYPES: ScraperFieldType[] = ["text", "number", "select", "multi-select", "checkbox", "country", "location", "campaign-selector"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function emptyField(): ScraperFormField {
  return { key: "", label: "", type: "text", required: false };
}

function FieldBuilderRow({ field, onChange, onRemove }: { field: ScraperFormField; onChange: (f: ScraperFormField) => void; onRemove: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border-subtle p-3 sm:grid-cols-12 sm:items-center">
      <Input
        className="sm:col-span-2"
        placeholder="key"
        value={field.key}
        onChange={(e) => onChange({ ...field, key: e.target.value })}
      />
      <Input
        className="sm:col-span-3"
        placeholder="Label"
        value={field.label}
        onChange={(e) => onChange({ ...field, label: e.target.value })}
      />
      <Select className="sm:col-span-3" value={field.type} onChange={(e) => onChange({ ...field, type: e.target.value as ScraperFieldType })}>
        {FIELD_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-1.5 text-xs text-text-secondary sm:col-span-2">
        <Checkbox checked={field.required} onCheckedChange={(v) => onChange({ ...field, required: Boolean(v) })} />
        Required
      </label>
      <Input
        className="sm:col-span-1"
        type="number"
        placeholder="min"
        value={field.min ?? ""}
        onChange={(e) => onChange({ ...field, min: e.target.value === "" ? undefined : Number(e.target.value) })}
      />
      <div className="flex items-center justify-end sm:col-span-1">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-danger" />
        </Button>
      </div>
    </div>
  );
}

export function AgentForm({ agent, trigger }: { agent?: ScraperAgent; trigger?: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<ScraperFormField[]>(agent?.formSchema ?? []);
  const [name, setName] = React.useState(agent?.name ?? "");
  const [slug, setSlug] = React.useState(agent?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(Boolean(agent));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFields(agent?.formSchema ?? []);
      setName(agent?.name ?? "");
      setSlug(agent?.slug ?? "");
      setSlugTouched(Boolean(agent));
      setError(null);
    }
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    formData.set("formSchemaJson", JSON.stringify(fields.filter((f) => f.key && f.label)));

    const result = agent ? await updateScraperAgentAction(agent.id, formData) : await createScraperAgentAction(formData);
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
        {trigger ?? (
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" /> Add Scraper Agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agent ? `Edit ${agent.name}` : "Add a scraper agent"}</DialogTitle>
          <DialogDescription>
            Points the CRM at an n8n workflow you&apos;ve already built and made campaign-aware. No token or credential value is ever entered here —
            those stay in n8n or server env vars.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Name *</Label>
              <Input
                id="a-name"
                name="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-slug">Slug *</Label>
              <Input
                id="a-slug"
                name="slug"
                required
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-description">Description *</Label>
            <Input id="a-description" name="description" required defaultValue={agent?.description} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-icon">Icon</Label>
              <Select id="a-icon" name="icon" defaultValue={agent?.icon ?? SCRAPER_ICON_NAMES[0]}>
                {SCRAPER_ICON_NAMES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-sourceLabel">Source label *</Label>
              <Input id="a-sourceLabel" name="sourceLabel" required placeholder="e.g. LinkedIn" defaultValue={agent?.sourceLabel} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-workflowId">n8n workflow ID *</Label>
              <Input id="a-workflowId" name="n8nWorkflowId" required defaultValue={agent?.n8nWorkflowId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-webhookPath">Start webhook path or URL *</Label>
              <Input
                id="a-webhookPath"
                name="startWebhookPath"
                required
                placeholder="webhook/biggbee/scrape-my-scraper"
                defaultValue={agent?.startWebhookPath}
              />
              <p className="text-xs text-text-tertiary">A bare path is joined onto N8N_BASE_URL. A full URL must be on the same host.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-webhookEnvVar">Or: server env var name holding the webhook URL (optional)</Label>
            <Input id="a-webhookEnvVar" name="startWebhookEnvVar" placeholder="N8N_WEBHOOK_SCRAPE_MY_SCRAPER" defaultValue={agent?.startWebhookEnvVar} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-defaultMax">Default lead limit *</Label>
              <Input id="a-defaultMax" name="defaultMaxLeads" type="number" min={1} required defaultValue={agent?.defaultMaxLeads ?? 20} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-maxAllowed">Maximum lead limit *</Label>
              <Input id="a-maxAllowed" name="maxAllowedLeads" type="number" min={1} required defaultValue={agent?.maxAllowedLeads ?? 100} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-supportedFields">Supported result fields (comma-separated)</Label>
            <Input id="a-supportedFields" name="supportedFields" placeholder="company, email, phone, website" defaultValue={agent?.supportedFields.join(", ")} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Form fields</Label>
              <Button type="button" variant="secondary" size="sm" onClick={() => setFields((prev) => [...prev, emptyField()])}>
                <Settings2 className="h-3.5 w-3.5" /> Add field
              </Button>
            </div>
            {fields.length === 0 && <p className="text-xs text-text-tertiary">No form fields yet — the run form will be empty.</p>}
            <div className="space-y-2">
              {fields.map((f, i) => (
                <FieldBuilderRow
                  key={i}
                  field={f}
                  onChange={(next) => setFields((prev) => prev.map((p, idx) => (idx === i ? next : p)))}
                  onRemove={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : agent ? "Save changes" : "Add agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
