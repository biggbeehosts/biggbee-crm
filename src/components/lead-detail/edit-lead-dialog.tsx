"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { Campaign, Lead } from "@/types";
import { LEAD_STATUSES } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { updateLeadAction } from "@/lib/actions/leads";

export function EditLeadDialog({ lead, campaigns }: { lead: Lead; campaigns: Campaign[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await updateLeadAction(lead.email, formData);
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
        <Button variant="secondary" size="sm">
          <Pencil className="h-3.5 w-3.5" /> Edit lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>Changes write straight to the Leads sheet.</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="l-name">Name</Label>
              <Input id="l-name" name="name" defaultValue={lead.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-company">Company</Label>
              <Input id="l-company" name="company" defaultValue={lead.company} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-website">Website</Label>
              <Input id="l-website" name="website" defaultValue={lead.website} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-industry">Industry</Label>
              <Input id="l-industry" name="industry" defaultValue={lead.industry} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-businessType">Business Type</Label>
              <Input id="l-businessType" name="businessType" defaultValue={lead.businessType} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-leadGenerationType">Lead Generation Type</Label>
              <Input id="l-leadGenerationType" name="leadGenerationType" defaultValue={lead.leadGenerationType} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-serviceOffered">Service Offered</Label>
              <Input id="l-serviceOffered" name="serviceOffered" defaultValue={lead.serviceOffered} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-phone">Phone</Label>
              <Input id="l-phone" name="phone" defaultValue={lead.phone} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-country">Country</Label>
              <Input id="l-country" name="country" defaultValue={lead.country} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-status">Status</Label>
              <Select id="l-status" name="status" defaultValue={lead.status}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-campaign">Campaign</Label>
              <Select id="l-campaign" name="campaignId" defaultValue={lead.campaignId ?? ""}>
                <option value="">— Unassigned —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
