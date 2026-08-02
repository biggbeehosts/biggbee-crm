"use client";

import * as React from "react";
import type { Lead } from "@/types";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EmailPreviewDrawer } from "./email-preview-drawer";
import { formatDate } from "@/lib/utils/date";
import { compareDatesEmptyLast } from "@/lib/utils/date";
import { Search, Send } from "lucide-react";

const RESULT_OPTIONS = [
  { value: "all", label: "Success or failure" },
  { value: "success", label: "Success only" },
  { value: "failure", label: "Failure only" },
];

export function OutreachTable({ leads }: { leads: Lead[] }) {
  const [result, setResult] = React.useState("all");
  const [service, setService] = React.useState("all");
  const [demoType, setDemoType] = React.useState("all");
  const [emailStyle, setEmailStyle] = React.useState("all");
  const [subjectVariant, setSubjectVariant] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Lead | null>(null);

  const sent = React.useMemo(() => leads.filter((l) => l.lastEmailDate).sort((a, b) => -compareDatesEmptyLast(a.lastEmailDate, b.lastEmailDate)), [leads]);

  const services = React.useMemo(() => uniqueSorted(sent.map((l) => l.serviceOffered)), [sent]);
  const demoTypes = React.useMemo(() => uniqueSorted(sent.map((l) => l.demoType)), [sent]);
  const styles = React.useMemo(() => uniqueSorted(sent.map((l) => l.emailStyle)), [sent]);
  const variants = React.useMemo(() => uniqueSorted(sent.map((l) => l.subjectVariant)), [sent]);

  const filtered = sent.filter((l) => {
    if (result === "success" && l.status === "Failed") return false;
    if (result === "failure" && l.status !== "Failed") return false;
    if (service !== "all" && (l.serviceOffered || "—") !== service) return false;
    if (demoType !== "all" && (l.demoType || "—") !== demoType) return false;
    if (emailStyle !== "all" && (l.emailStyle || "—") !== emailStyle) return false;
    if (subjectVariant !== "all" && (l.subjectVariant || "—") !== subjectVariant) return false;
    if (search && !`${l.company} ${l.email} ${l.lastEmailSubject}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sends…" className="pl-8" />
        </div>
        <Select value={result} onChange={(e) => setResult(e.target.value)} className="w-44">
          {RESULT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={service} onChange={(e) => setService(e.target.value)} className="w-40">
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={demoType} onChange={(e) => setDemoType(e.target.value)} className="w-36">
          <option value="all">All demo types</option>
          {demoTypes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={emailStyle} onChange={(e) => setEmailStyle(e.target.value)} className="w-36">
          <option value="all">All styles</option>
          {styles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={subjectVariant} onChange={(e) => setSubjectVariant(e.target.value)} className="w-36">
          <option value="all">All subject variants</option>
          {variants.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Send} title="No sends match your filters" className="m-5" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-surface-raised text-xs text-text-tertiary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Service</th>
                  <th className="px-4 py-2.5 font-medium">Style</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Demo</th>
                  <th className="px-4 py-2.5 font-medium">Follow-up</th>
                  <th className="px-4 py-2.5 font-medium">Confidence</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((lead) => (
                  <tr key={lead.email} onClick={() => setSelected(lead)} className="cursor-pointer transition-colors hover:bg-panel">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{lead.company}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{lead.serviceOffered || "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{lead.emailStyle || "—"}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-text-secondary">{lead.lastEmailSubject || "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{lead.demoType || "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{lead.followUpCount}</td>
                    <td className="px-4 py-2.5">
                      <ConfidenceBadge value={lead.confidence} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-2.5 text-text-tertiary">{formatDate(lead.lastEmailDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EmailPreviewDrawer lead={selected} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}

function uniqueSorted(values: (string | undefined)[]): string[] {
  const set = new Set(values.map((v) => v?.trim()).filter(Boolean) as string[]);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
