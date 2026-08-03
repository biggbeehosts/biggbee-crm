"use client";

import * as React from "react";
import type { Campaign, ScraperFormField, ScraperFormSchema } from "@/types";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export type DynamicFormValues = Record<string, string | number | boolean | string[]>;

function defaultValueFor(field: ScraperFormField): string | number | boolean | string[] {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "checkbox") return false;
  if (field.type === "multi-select") return [];
  if (field.type === "number") return "";
  return "";
}

export function defaultsForSchema(schema: ScraperFormSchema): DynamicFormValues {
  const values: DynamicFormValues = {};
  for (const field of schema) values[field.key] = defaultValueFor(field);
  return values;
}

/**
 * Renders a ScraperFormSchema as real inputs -- this is what makes adding a scraper a config
 * action (Part C/I): no new form component is ever written for a new agent, only a new schema
 * array. `countries` and `campaigns` back the two field types that need a live list rather than
 * static options.
 */
export function DynamicForm({
  schema,
  values,
  onChange,
  countries,
  campaigns,
}: {
  schema: ScraperFormSchema;
  values: DynamicFormValues;
  onChange: (key: string, value: string | number | boolean | string[]) => void;
  countries: string[];
  campaigns: Campaign[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {schema.map((field) => (
        <div key={field.key} className={field.type === "checkbox" ? "flex items-center gap-2 pt-6" : "space-y-1.5"}>
          {field.type !== "checkbox" && (
            <Label htmlFor={`f-${field.key}`}>
              {field.label}
              {field.required && <span className="text-danger"> *</span>}
            </Label>
          )}

          {field.type === "text" && (
            <Input
              id={`f-${field.key}`}
              value={String(values[field.key] ?? "")}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}

          {field.type === "number" && (
            <Input
              id={`f-${field.key}`}
              type="number"
              value={values[field.key] === "" || values[field.key] === undefined ? "" : String(values[field.key])}
              placeholder={field.placeholder}
              required={field.required}
              min={field.min}
              max={field.max}
              onChange={(e) => onChange(field.key, e.target.value === "" ? "" : Number(e.target.value))}
            />
          )}

          {field.type === "location" && (
            <Input
              id={`f-${field.key}`}
              value={String(values[field.key] ?? "")}
              placeholder={field.placeholder || "City, region…"}
              required={field.required}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}

          {field.type === "country" && (
            <Select id={`f-${field.key}`} value={String(values[field.key] ?? "")} required={field.required} onChange={(e) => onChange(field.key, e.target.value)}>
              <option value="">{field.required ? "Select…" : "Any country"}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}

          {field.type === "campaign-selector" && (
            <Select id={`f-${field.key}`} value={String(values[field.key] ?? "")} required={field.required} onChange={(e) => onChange(field.key, e.target.value)}>
              <option value="">Select a campaign…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </Select>
          )}

          {field.type === "select" && (
            <Select id={`f-${field.key}`} value={String(values[field.key] ?? "")} required={field.required} onChange={(e) => onChange(field.key, e.target.value)}>
              <option value="">Select…</option>
              {(field.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}

          {field.type === "multi-select" && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-border-subtle p-2">
              {(field.options ?? []).map((o) => {
                const selected = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : [];
                const checked = selected.includes(o.value);
                return (
                  <label key={o.value} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v ? [...selected, o.value] : selected.filter((s) => s !== o.value);
                        onChange(field.key, next);
                      }}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          )}

          {field.type === "checkbox" && (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <Checkbox checked={Boolean(values[field.key])} onCheckedChange={(v) => onChange(field.key, Boolean(v))} />
              {field.label}
            </label>
          )}

          {field.helpText && <p className="text-xs text-text-tertiary">{field.helpText}</p>}
        </div>
      ))}
    </div>
  );
}
