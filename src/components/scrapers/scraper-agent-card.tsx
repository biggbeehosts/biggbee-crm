"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Power, PowerOff, Wrench, Zap } from "lucide-react";
import type { Campaign, ScraperAgent } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { ScraperIcon } from "./icon-map";
import { AgentForm } from "./agent-form";
import { RunScraperDialog } from "./run-scraper-dialog";
import { setScraperAgentStatusAction } from "@/lib/actions/scrapers";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

/** "lime" only appears when the agent is genuinely running right now -- Active-but-idle stays the
 *  quieter `success`, matching the app-wide "lime = live, success = healthy-but-static" rule. */
const STATUS_VARIANT = { Active: "success", Disabled: "outline", Maintenance: "warning" } as const;

export interface ScraperAgentStats {
  lastRun: string | null;
  totalLeadsScraped: number;
  totalRuns: number;
  successfulRuns: number;
  totalScraped: number;
  totalValid: number;
  totalDuplicates: number;
  currentJobCampaignName: string | null;
  currentJobStatus: string | null;
  lastCampaignName: string | null;
}

export function ScraperAgentCard({
  agent,
  stats,
  campaigns,
  countries,
}: {
  agent: ScraperAgent;
  stats: ScraperAgentStats;
  campaigns: Campaign[];
  countries: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  const successRate = stats.totalRuns > 0 ? Math.round((stats.successfulRuns / stats.totalRuns) * 100) : null;

  async function toggleStatus() {
    setPending(true);
    const result = await setScraperAgentStatusAction(agent.id, agent.status === "Active" ? "Disabled" : "Active");
    setPending(false);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) router.refresh();
  }

  const capabilities = [
    agent.supportsCampaigns && "Campaigns",
    agent.supportsPreview && "Preview",
    agent.supportsApproval && "Approval",
    agent.supportsDuplicateDetection && "Duplicate detection",
  ].filter((c): c is string => Boolean(c));

  const isRunningNow = stats.currentJobStatus === "Running" || stats.currentJobStatus === "Queued";

  return (
    <Card id={`scraper-${agent.id}`} level={2} glow={isRunningNow} className="flex scroll-mt-20 flex-col gap-3.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
            <ScraperIcon name={agent.icon} className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{agent.name}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{agent.sourceLabel}</p>
          </div>
        </div>
        <Badge variant={isRunningNow ? "lime" : STATUS_VARIANT[agent.status]}>{isRunningNow ? "Running" : agent.status}</Badge>
      </div>

      <p className="text-xs text-text-secondary">{agent.description}</p>

      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {capabilities.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {(isRunningNow ? stats.currentJobCampaignName : stats.lastCampaignName) && (
        <div className="flex items-center gap-1.5 text-xs">
          {isRunningNow && <Zap className="h-3 w-3 shrink-0 text-accent-lime" />}
          <span className="text-text-tertiary">{isRunningNow ? "Running for" : "Last run for"}</span>
          <span className="truncate font-medium text-accent-strong">{isRunningNow ? stats.currentJobCampaignName : stats.lastCampaignName}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-x-2 gap-y-2.5 rounded-lg bg-panel px-3 py-2.5 text-center">
        <div>
          <p className="text-sm font-semibold text-text-primary">{stats.lastRun ? formatRelativeTime(stats.lastRun) : "—"}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary" title={stats.lastRun ? formatDateTime(stats.lastRun) : undefined}>
            Last run
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{stats.totalScraped}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Scraped</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{successRate === null ? "—" : `${successRate}%`}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Success rate</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{stats.totalValid}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Valid</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{stats.totalLeadsScraped}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Imported</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{stats.totalDuplicates}</p>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Duplicates</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RunScraperDialog agent={agent} campaigns={campaigns} countries={countries} />
        <AgentForm
          agent={agent}
          trigger={
            <Button variant="secondary" size="sm">
              <Pencil className="h-3.5 w-3.5" /> Edit Configuration
            </Button>
          }
        />
        <Button variant="ghost" size="sm" onClick={toggleStatus} disabled={pending} className="ml-auto">
          {agent.status === "Active" ? (
            <>
              <PowerOff className="h-3.5 w-3.5" /> Disable
            </>
          ) : (
            <>
              <Power className="h-3.5 w-3.5" /> Enable
            </>
          )}
        </Button>
      </div>
      {agent.status === "Maintenance" && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <Wrench className="h-3 w-3" /> In maintenance — runs are disabled until re-activated.
        </p>
      )}
      {campaigns.length === 0 && agent.supportsCampaigns && (
        <p className={cn("text-[11px] text-text-tertiary")}>No campaigns yet — running this agent will need one to gate leads into.</p>
      )}
    </Card>
  );
}
