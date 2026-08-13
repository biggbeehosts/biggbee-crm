"use client";

import * as React from "react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const CUSTOM = "__custom__";

/**
 * A form field for a lead targeting attribute (Industry, Business Type, Service Offered, Lead
 * Generation Type, Country) that shares the same canonical option list the Campaign form uses
 * (see src/lib/data/options-store.ts), instead of a disconnected free-text input -- the taxonomy
 * drift that let "Lead Generation" (lead) and "Lead Generation Agency" (campaign) silently diverge.
 *
 * A legacy value that isn't in the current option list is never dropped or silently replaced: it
 * loads into the custom text field so it keeps submitting unchanged until an admin deliberately
 * picks a canonical option from the dropdown instead.
 */
export function TaxonomyField({
  id,
  name,
  label,
  options,
  defaultValue,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const normalized = (defaultValue ?? "").trim();
  const matchesOption = normalized !== "" && options.includes(normalized);
  const [isCustom, setIsCustom] = React.useState(normalized !== "" && !matchesOption);

  if (options.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} name={name} defaultValue={defaultValue} placeholder={placeholder} />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {isCustom ? (
        <div className="flex gap-1.5">
          <Input id={id} name={name} defaultValue={defaultValue} placeholder={placeholder} />
          <Button type="button" variant="secondary" size="sm" onClick={() => setIsCustom(false)}>
            Use list
          </Button>
        </div>
      ) : (
        <Select
          id={id}
          name={name}
          defaultValue={matchesOption ? normalized : ""}
          onChange={(e) => {
            if (e.target.value === CUSTOM) setIsCustom(true);
          }}
        >
          <option value="">Any / not set</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={CUSTOM}>Other (custom value)…</option>
        </Select>
      )}
    </div>
  );
}
