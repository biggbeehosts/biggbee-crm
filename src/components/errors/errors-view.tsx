"use client";

import * as React from "react";
import Link from "next/link";
import type { ErrorRecord } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { daysSince, formatDateTime } from "@/lib/utils/date";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Search, ShieldAlert, Users } from "lucide-react";

type Severity = "critical" | "warning" | "info";

function severityOf(err: ErrorRecord): Severity {
  const source = (err.source ?? "").toLowerCase();
  if (source.includes("validation")) return "warning";
  if (source.includes("drive") || source.includes("crawl")) return "info";
  return "critical";
}

const SEVERITY_BADGE: Record<Severity, "danger" | "warning" | "default"> = {
  critical: "danger",
  warning: "warning",
  info: "default",
};

export function ErrorsView({ errors }: { errors: ErrorRecord[] }) {
  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState("all");
  const [node, setNode] = React.useState("all");
  const [dateRange, setDateRange] = React.useState("all");
  const [leadFilter, setLeadFilter] = React.useState("all");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const sources = React.useMemo(() => unique(errors.map((e) => e.source)), [errors]);
  const nodes = React.useMemo(() => unique(errors.map((e) => e.nodeName)), [errors]);
  const leadEmails = React.useMemo(() => unique(errors.map((e) => e.leadEmail)), [errors]);

  const filtered = errors.filter((e) => {
    if (source !== "all" && (e.source || "—") !== source) return false;
    if (node !== "all" && (e.nodeName || "—") !== node) return false;
    if (leadFilter !== "all" && (e.leadEmail || "—") !== leadFilter) return false;
    if (dateRange !== "all") {
      const age = daysSince(e.timestamp);
      if (age === null || age > Number(dateRange)) return false;
    }
    if (search && !`${e.errorMessage} ${e.leadEmail} ${e.company} ${e.nodeName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const validationCount = errors.filter((e) => severityOf(e) === "warning").length;
  const sendCount = errors.filter((e) => severityOf(e) === "critical").length;
  const affectedLeads = new Set(errors.map((e) => e.leadEmail).filter(Boolean)).size;
  const topNodes = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of errors) {
      if (!e.nodeName) continue;
      counts.set(e.nodeName, (counts.get(e.nodeName) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3);
  }, [errors]);

  async function copyError(err: ErrorRecord) {
    await navigator.clipboard.writeText(JSON.stringify(err, null, 2));
    setCopied(err.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Errors" value={errors.length} icon={AlertTriangle} tone={errors.length > 0 ? "danger" : "default"} />
        <StatCard label="Validation Errors" value={validationCount} icon={ShieldAlert} tone={validationCount > 0 ? "warning" : "default"} />
        <StatCard label="Send Errors" value={sendCount} icon={AlertTriangle} tone={sendCount > 0 ? "danger" : "default"} />
        <StatCard
          label="Affected Leads"
          value={affectedLeads}
          icon={Users}
          hint={topNodes.length ? `top node: ${topNodes[0].name} (${topNodes[0].count})` : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search errors…" className="pl-8" />
        </div>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-44">
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={node} onChange={(e) => setNode(e.target.value)} className="w-48">
          <option value="all">All nodes</option>
          {nodes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} className="w-52">
          <option value="all">All leads</option>
          {leadEmails.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="w-36">
          <option value="all">Any time</option>
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Check} title="No errors match your filters" className="m-5" />
        ) : (
          <div className="divide-y divide-border-subtle">
            {filtered.map((err) => {
              const severity = severityOf(err);
              const isOpen = expanded === err.id;
              return (
                <div key={err.id}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : err.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-panel"
                  >
                    {isOpen ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={SEVERITY_BADGE[severity]}>{severity}</Badge>
                        <span className="text-xs text-text-tertiary">{err.source || "Unknown source"}</span>
                        {err.nodeName && <span className="text-xs text-text-tertiary">· {err.nodeName}</span>}
                        <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{formatDateTime(err.timestamp)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-text-primary">{err.errorMessage || "No message recorded"}</p>
                      {(err.company || err.leadEmail) && (
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          {err.company}
                          {err.company && err.leadEmail ? " · " : ""}
                          {err.leadEmail}
                        </p>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border-subtle bg-surface-raised px-11 py-3">
                      <pre className="overflow-x-auto rounded-lg bg-canvas p-3 text-[11px] leading-relaxed text-text-secondary">
                        {JSON.stringify(err, null, 2)}
                      </pre>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => copyError(err)}>
                          {copied === err.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied === err.id ? "Copied" : "Copy error"}
                        </Button>
                        {err.leadEmail && (
                          <Button size="sm" variant="secondary" asChild>
                            <Link href={`/leads/${encodeURIComponent(err.leadEmail)}`}>Open lead</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function unique(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.map((v) => v?.trim()).filter(Boolean) as string[])).sort();
}
