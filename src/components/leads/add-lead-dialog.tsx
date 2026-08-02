"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addLeadAction } from "@/lib/actions/leads";

export interface AddLeadOptions {
  countries: string[];
  industries: string[];
}

export function AddLeadDialog({ options }: { options?: AddLeadOptions }) {
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
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              {options?.industries.length ? (
                <Select id="industry" name="industry" defaultValue="">
                  <option value="">Select…</option>
                  {options.industries.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id="industry" name="industry" placeholder="Real Estate" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              {options?.countries.length ? (
                <Select id="country" name="country" defaultValue="">
                  <option value="">Select…</option>
                  {options.countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id="country" name="country" placeholder="United States" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="+1 555 555 0100" />
            </div>
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
