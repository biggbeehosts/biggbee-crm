"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, PlayCircle, RefreshCw, RotateCcw, Search, Trash2, XCircle } from "lucide-react";
import type { ScrapingJob } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { cancelScrapingJobAction, deleteScrapingJobAction, retryScrapingJobAction } from "@/lib/actions/scrapers";
import { useToast } from "@/components/ui/toast";

const STATUS_VARIANT: Record<ScrapingJob["status"], "default" | "accent" | "success" | "warning" | "danger" | "outline"> = {
  Draft: "outline",
  Queued: "default",
  Running: "accent",
  Completed: "success",
  "Partially Completed": "warning",
  Failed: "danger",
  Cancelled: "outline",
};

export function ScrapingJobsView({ jobs, executionUrls }: { jobs: ScrapingJob[]; executionUrls: Record<string, string | null> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const filtered = jobs.filter((j) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return j.id.toLowerCase().includes(s) || j.scraperName.toLowerCase().includes(s) || j.campaignName.toLowerCase().includes(s);
  });

  async function run(job: ScrapingJob, fn: () => Promise<{ success: boolean; message: string }>) {
    setPendingId(job.id);
    const result = await fn();
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
    setPendingId(null);
  }

  function retry(job: ScrapingJob) {
    return run(job, () => retryScrapingJobAction(job.id));
  }
  function cancel(job: ScrapingJob) {
    return run(job, () => cancelScrapingJobAction(job.id));
  }
  function remove(job: ScrapingJob) {
    if (!window.confirm(`Delete job ${job.id}? This only removes the job record, not any leads it already imported.`)) return;
    return run(job, () => deleteScrapingJobAction(job.id));
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs…" className="pl-8" />
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title={jobs.length === 0 ? "No scraping jobs yet" : "Nothing matches"}
            description={jobs.length === 0 ? "Start a run from Scraper Agents to see it here." : undefined}
            className="m-5"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((job) => {
              const pending = pendingId === job.id;
              const canCancel = job.status === "Queued" || job.status === "Running";
              const canRetryOrStart = job.status === "Draft" || job.status === "Queued" || job.status === "Failed" || job.status === "Cancelled" || job.status === "Completed" || job.status === "Partially Completed";
              const execUrl = job.n8nExecutionId ? executionUrls[job.id] : null;
              return (
                <li key={job.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">{job.scraperName}</p>
                      <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                      <span className="text-[11px] text-text-tertiary">{job.id}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Campaign: {job.campaignName || job.campaignId} · Requested {job.requestedCount} · Scraped {job.scrapedCount} · Duplicates{" "}
                      {job.duplicateCount} · Imported {job.importedCount}
                    </p>
                    {job.errorSummary && <p className="mt-0.5 text-xs text-danger">{job.errorSummary}</p>}
                    <p className="mt-0.5 text-[11px] text-text-tertiary" title={job.startedAt ? formatDateTime(job.startedAt) : undefined}>
                      {job.startedAt ? `Started ${formatRelativeTime(job.startedAt)}` : "Not started"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <Link href={`/lead-generation/scraped-leads?jobId=${encodeURIComponent(job.id)}`}>
                      <Button size="sm" variant="secondary">
                        View Results
                      </Button>
                    </Link>
                    {execUrl && (
                      <a href={execUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="h-3.5 w-3.5" /> Execution
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    {canCancel && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(job)} disabled={pending}>
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                    {canRetryOrStart && (
                      <Button size="sm" variant="ghost" onClick={() => retry(job)} disabled={pending}>
                        <RotateCcw className="h-3.5 w-3.5" /> {job.status === "Draft" ? "Start" : "Retry"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => remove(job)} disabled={pending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
