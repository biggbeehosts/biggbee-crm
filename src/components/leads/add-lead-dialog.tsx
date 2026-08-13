"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TaxonomyField } from "./taxonomy-field";
import { addLeadAction } from "@/lib/actions/leads";
import type { Campaign, LeadTaxonomyOptions } from "@/types";

export type AddLeadOptions = LeadTaxonomyOptions;

export function AddLeadDialog({ options, campaigns = [] }: { options?: AddLeadOptions; campaigns?: Campaign[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await addLeadAction(formData);
    setPending(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>
            Adds a new row to the Leads sheet with status &quot;New&quot;. The workflow will pick it up on its next scheduled run.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Contact name *</Label>
              <Input id="name" name="name" required placeholder="Jordan Whitfield" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company *</Label>
              <Input id="company" name="company" required placeholder="Maple Leaf Local Maps" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required placeholder="team@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" placeholder="https://company.com" />
            </div>
            <TaxonomyField id="industry" name="industry" label="Industry" options={options?.industries ?? []} placeholder="Real Estate" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TaxonomyField id="businessType" name="businessType" label="Business Type" options={options?.businessTypes ?? []} placeholder="Marketing Agency" />
            <TaxonomyField
              id="leadGenerationType"
              name="leadGenerationType"
              label="Lead Generation Type"
              options={options?.leadGenerationTypes ?? []}
              placeholder="Google Maps"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TaxonomyField id="serviceOffered" name="serviceOffered" label="Service Offered" options={options?.services ?? []} placeholder="Lead Generation Agents" />
            <TaxonomyField id="country" name="country" label="Country" options={options?.countries ?? []} placeholder="United States" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="+1 555 555 0100" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaignId">Campaign</Label>
            <Select id="campaignId" name="campaignId" defaultValue="">
              <option value="">— Unassigned —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Adding…" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
