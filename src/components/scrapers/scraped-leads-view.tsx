"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, Search, Trash2, UserSearch, X } from "lucide-react";
import type { Campaign, Lead, ScrapingJob } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { toCsv, downloadCsv } from "@/lib/utils/csv";
import { approveLeadsAction, deleteLeadAction, rejectLeadsAction, bulkDeleteLeadsAction } from "@/lib/actions/leads";
import { EditLeadDialog } from "@/components/lead-detail/edit-lead-dialog";
import { StartOutreachDialog } from "./start-outreach-dialog";
import { useToast } from "@/components/ui/toast";

export function ScrapedLeadsView({
  leads,
  allLeads,
  campaigns,
  jobs,
  initialJobId,
  runCampaignConfigured,
}: {
  /** Staged-only leads shown in the review list below. */
  leads: Lead[];
  /** Full lead pool (all statuses) -- needed by Start Campaign Outreach's preview, which counts
   *  already-approved (Status = New) leads, not staged ones. */
  allLeads: Lead[];
  campaigns: Campaign[];
  jobs: ScrapingJob[];
  initialJobId: string;
  runCampaignConfigured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [campaignFilter, setCampaignFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [jobFilter, setJobFilter] = React.useState(initialJobId);
  const [emailFilter, setEmailFilter] = React.useState<"any" | "has" | "missing">("any");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);

  const sources = Array.from(new Set(leads.map((l) => l.source).filter((s): s is string => Boolean(s))));

  const filtered = leads.filter((l) => {
    if (campaignFilter && l.campaignId !== campaignFilter) return false;
    if (sourceFilter && l.source !== sourceFilter) return false;
    if (jobFilter && l.scraperJobId !== jobFilter) return false;
    if (emailFilter === "has" && !l.email) return false;
    if (emailFilter === "missing" && l.email) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!`${l.name} ${l.company} ${l.email} ${l.website ?? ""}`.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  function toggleOne(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((l) => l.email))));
  }

  async function runBulk(action: (emails: string[]) => Promise<{ success: boolean; message: string }>) {
    if (selected.size === 0) return;
    setPending(true);
    const result = await action(Array.from(selected));
    toast(result.message, result.success ? "success" : "error");
    setSelected(new Set());
    router.refresh();
    setPending(false);
  }

  async function approveOne(email: string) {
    setPending(true);
    const result = await approveLeadsAction([email]);
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
    setPending(false);
  }

  async function rejectOne(email: string) {
    setPending(true);
    const result = await rejectLeadsAction([email]);
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
    setPending(false);
  }

  async function deleteOne(email: string) {
    if (!window.confirm(`Delete this lead permanently?`)) return;
    setPending(true);
    const result = await deleteLeadAction(email);
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
    setPending(false);
  }

  function exportCsv() {
    const csv = toCsv(filtered, [
      { key: "leadId", header: "Lead ID" },
      { key: "name", header: "Name" },
      { key: "company", header: "Company" },
      { key: "email", header: "Email" },
      { key: "phone", header: "Phone" },
      { key: "website", header: "Website" },
      { key: "country", header: "Country" },
      { key: "location", header: "Location" },
      { key: "campaignId", header: "Campaign ID" },
      { key: "campaignName", header: "Campaign Name" },
      { key: "source", header: "Source" },
      { key: "scraperJobId", header: "Scraper Job ID" },
      { key: "status", header: "Status" },
      { key: "createdAt", header: "Created At" },
    ]);
    downloadCsv(`biggbee-scraped-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staged leads…" className="pl-8" />
        </div>
        <Select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="w-44">
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-40">
          <option value="">All scrapers</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="w-44">
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.id} ({j.scraperName})
            </option>
          ))}
        </Select>
        <Select value={emailFilter} onChange={(e) => setEmailFilter(e.target.value as typeof emailFilter)} className="w-36">
          <option value="any">Email: any</option>
          <option value="has">Has email</option>
          <option value="missing">Missing email</option>
        </Select>
        <p className="text-xs text-text-tertiary">
          {filtered.length} of {leads.length} staged
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <StartOutreachDialog campaigns={campaigns} leads={allLeads} runCampaignConfigured={runCampaignConfigured} />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2">
          <Badge variant="accent">{selected.size} selected</Badge>
          <Button size="sm" variant="secondary" onClick={() => runBulk(approveLeadsAction)} disabled={pending}>
            <CheckCheck className="h-3.5 w-3.5" /> Bulk approve
          </Button>
          <Button size="sm" variant="ghost" onClick={() => runBulk(rejectLeadsAction)} disabled={pending}>
            <X className="h-3.5 w-3.5" /> Bulk reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            onClick={() => {
              if (window.confirm(`Delete ${selected.size} leads permanently?`)) runBulk(bulkDeleteLeadsAction);
            }}
            disabled={pending}
          >
            <Trash2 className="h-3.5 w-3.5" /> Bulk delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title={leads.length === 0 ? "No staged leads" : "Nothing matches"}
            description={leads.length === 0 ? "Run a scraper from Scraper Agents to see results here for review." : undefined}
            className="m-5"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            <li className="flex items-center gap-3 bg-panel px-4 py-2">
              <Checkbox checked={selected.size === filtered.length} onCheckedChange={toggleAll} />
              <span className="text-[11px] uppercase tracking-wide text-text-tertiary">Select all</span>
            </li>
            {filtered.map((lead) => (
              <li key={lead.email || lead.leadId} className="flex items-start gap-3 px-4 py-3">
                <Checkbox checked={selected.has(lead.email)} onCheckedChange={() => toggleOne(lead.email)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{lead.company}</p>
                    <Badge variant="outline">{lead.source || "Manual"}</Badge>
                    {lead.campaignName && <Badge variant="accent">{lead.campaignName}</Badge>}
                    <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{lead.createdAt ? formatDateTime(lead.createdAt) : ""}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {lead.name} · {lead.email || "no email"} · {lead.phone || "no phone"} · {lead.location || lead.country || "no location"}
                  </p>
                  {lead.website && (
                    <a href={lead.website} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-accent-strong hover:underline">
                      {lead.website}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <EditLeadDialog lead={lead} campaigns={campaigns} />
                  <Button size="sm" variant="secondary" onClick={() => approveOne(lead.email)} disabled={pending || !lead.email}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => rejectOne(lead.email)} disabled={pending || !lead.email}>
                    Reject
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => deleteOne(lead.email)} disabled={pending} aria-label="Delete lead">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
