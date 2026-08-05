"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import type { WebsiteRegistryEntry } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createWebsiteAction, updateWebsiteAction } from "@/lib/actions/website-registry";
import { useToast } from "@/components/ui/toast";

export function WebsiteFormDialog({ site, trigger }: { site?: WebsiteRegistryEntry; trigger?: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(site?.active ?? true);
  const [autoSyncEnabled, setAutoSyncEnabled] = React.useState(site?.autoSyncEnabled ?? false);
  const [dailySyncEnabled, setDailySyncEnabled] = React.useState(site?.dailySyncEnabled ?? false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setActive(site?.active ?? true);
      setAutoSyncEnabled(site?.autoSyncEnabled ?? false);
      setDailySyncEnabled(site?.dailySyncEnabled ?? false);
      setError(null);
    }
  }

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    formData.set("active", active ? "true" : "false");
    formData.set("autoSyncEnabled", autoSyncEnabled ? "true" : "false");
    formData.set("dailySyncEnabled", dailySyncEnabled ? "true" : "false");

    const result = site ? await updateWebsiteAction(site.id, formData) : await createWebsiteAction(formData);
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
            <Plus className="h-3.5 w-3.5" /> Add Website
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{site ? `Edit ${site.label}` : "Add a website"}</DialogTitle>
          <DialogDescription>
            Registers a site whose knowledge base is synced from n8n into its own KB_Cache row. No credential value is entered here.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-label">Label *</Label>
            <Input id="w-label" name="label" required defaultValue={site?.label} placeholder="Client Dental Site" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-url">Website URL *</Label>
            <Input id="w-url" name="url" required defaultValue={site?.url} placeholder="https://example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-webhookPath">Sync webhook path or URL</Label>
            <Input id="w-webhookPath" name="webhookPath" placeholder="webhook/biggbee/sync-kb-example" defaultValue={site?.webhookPath} />
            <p className="text-xs text-text-tertiary">A bare path is joined onto N8N_BASE_URL. A full URL must be on the same host.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-webhookEnvVar">Or: server env var name holding the webhook URL (optional)</Label>
            <Input id="w-webhookEnvVar" name="webhookEnvVar" placeholder="N8N_WEBHOOK_SYNC_KB_EXAMPLE" defaultValue={site?.webhookEnvVar} />
          </div>

          <div className="space-y-2 rounded-lg border border-border-subtle p-3">
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Active" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto sync</Label>
                <p className="text-[11px] text-text-tertiary">Marks intent -- real scheduling still needs an n8n Schedule Trigger.</p>
              </div>
              <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} aria-label="Auto sync" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Daily sync</Label>
              <Switch checked={dailySyncEnabled} onCheckedChange={setDailySyncEnabled} aria-label="Daily sync" />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : site ? "Save changes" : "Add website"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WebsiteEditTrigger({ site }: { site: WebsiteRegistryEntry }) {
  return (
    <WebsiteFormDialog
      site={site}
      trigger={
        <Button variant="ghost" size="sm">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      }
    />
  );
}
