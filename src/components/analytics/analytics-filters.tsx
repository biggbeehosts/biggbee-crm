"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { Campaign, CountPoint, DemoRecord } from "@/types";

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "custom", label: "Custom Range" },
];

export interface AnalyticsFilterValues {
  range: string;
  from?: string;
  to?: string;
  campaignId?: string;
  source?: string;
  country?: string;
  industry?: string;
  businessType?: string;
  targetService?: string;
  demoId?: string;
  subjectVariant?: string;
  emailStyle?: string;
  recipientDomain?: string;
  scraperJobId?: string;
  senderDomain?: string;
}

/** Client filter bar that navigates via URL search params -- the server component page.tsx re-runs
 *  the whole aggregation server-side on every change (Part L: never load raw events into the
 *  browser to filter client-side). */
export function AnalyticsFilters({
  values,
  campaigns,
  demos,
  dimensions,
  recipientDomains,
  subjectVariants,
  emailStyles,
}: {
  values: AnalyticsFilterValues;
  campaigns: Campaign[];
  demos: DemoRecord[];
  dimensions: {
    sources: CountPoint[];
    countries: CountPoint[];
    industries: CountPoint[];
    businessTypes: CountPoint[];
    targetServices: CountPoint[];
    scraperJobs: CountPoint[];
    senderDomains: CountPoint[];
  };
  recipientDomains: string[];
  subjectVariants: string[];
  emailStyles: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date range">
          <Select value={values.range} onChange={(e) => setParam("range", e.target.value)}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {values.range === "custom" && (
          <>
            <Field label="From">
              <Input type="date" className="w-36" defaultValue={values.from?.slice(0, 10)} onChange={(e) => setParam("from", e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" className="w-36" defaultValue={values.to?.slice(0, 10)} onChange={(e) => setParam("to", e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Campaign">
          <Select value={values.campaignId ?? "all"} onChange={(e) => setParam("campaignId", e.target.value)}>
            <option value="all">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <OptionSelect value={values.source} options={dimensions.sources} onChange={(v) => setParam("source", v)} allLabel="All sources" />
        </Field>
        <Field label="Country">
          <OptionSelect value={values.country} options={dimensions.countries} onChange={(v) => setParam("country", v)} allLabel="All countries" />
        </Field>
        <Field label="Industry">
          <OptionSelect value={values.industry} options={dimensions.industries} onChange={(v) => setParam("industry", v)} allLabel="All industries" />
        </Field>
        <Field label="Business type">
          <OptionSelect
            value={values.businessType}
            options={dimensions.businessTypes}
            onChange={(v) => setParam("businessType", v)}
            allLabel="All business types"
          />
        </Field>
        <Field label="Target service">
          <OptionSelect
            value={values.targetService}
            options={dimensions.targetServices}
            onChange={(v) => setParam("targetService", v)}
            allLabel="All services"
          />
        </Field>
        <Field label="Demo">
          <Select value={values.demoId ?? "all"} onChange={(e) => setParam("demoId", e.target.value)}>
            <option value="all">All demos</option>
            {demos.map((d) => (
              <option key={d.demoId} value={d.demoId}>
                {d.name || d.demoType}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scraper">
          <OptionSelect value={values.scraperJobId} options={dimensions.scraperJobs} onChange={(v) => setParam("scraperJobId", v)} allLabel="All scrapers" />
        </Field>
        <Field label="Subject variant">
          <Select value={values.subjectVariant ?? "all"} onChange={(e) => setParam("subjectVariant", e.target.value)}>
            <option value="all">All subject variants</option>
            {subjectVariants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email style">
          <Select value={values.emailStyle ?? "all"} onChange={(e) => setParam("emailStyle", e.target.value)}>
            <option value="all">All email styles</option>
            {emailStyles.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sender domain">
          <OptionSelect
            value={values.senderDomain}
            options={dimensions.senderDomains}
            onChange={(v) => setParam("senderDomain", v)}
            allLabel="All sender domains"
          />
        </Field>
        <Field label="Recipient domain">
          <Select value={values.recipientDomain ?? "all"} onChange={(e) => setParam("recipientDomain", e.target.value)}>
            <option value="all">All domains</option>
            {recipientDomains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-tertiary">{label}</span>
      {children}
    </div>
  );
}

function OptionSelect({
  value,
  options,
  onChange,
  allLabel,
}: {
  value?: string;
  options: CountPoint[];
  onChange: (value: string) => void;
  allLabel: string;
}) {
  return (
    <Select value={value ?? "all"} onChange={(e) => onChange(e.target.value)}>
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o.label} value={o.label}>
          {o.label} ({o.value})
        </option>
      ))}
    </Select>
  );
}
