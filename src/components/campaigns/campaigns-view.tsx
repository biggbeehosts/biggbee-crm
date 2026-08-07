"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Copy, Pause, Play, Target, Trash2 } from "lucide-react";
import type { Campaign, CampaignMatchSummary, DemoRecord, Lead, OptionLists, WebsiteRegistryEntry } from "@/types";
import { filterCampaignLeads, summarizeCampaignMatch } from "@/lib/calculations/campaign-match";
import { resolveCampaignDemo } from "@/lib/calculations/demo-match";
import type { TrackingSnapshot } from "@/lib/calculations/tracking-metrics";
import type { TimelineEvent } from "@/lib/calculations/timeline";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { CampaignFormDialog } from "./campaign-form-dialog";
import { CampaignPipelineStrip } from "./campaign-pipeline-strip";
import { CampaignSummary } from "./campaign-summary";
import { CampaignAnalyticsCard } from "./campaign-analytics-card";
import { TimelineTab } from "@/components/lead-detail/timeline-tab";
import { ExportCampaignAnalyticsButton } from "./export-campaign-analytics-button";
import { deleteCampaignAction, duplicateCampaignAction, setCampaignStatusAction } from "@/lib/actions/campaigns";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const STATUS_TONE: Record<Campaign["status"], "success" | "warning" | "outline"> = {
  Active: "success",
  Paused: "warning",
  Draft: "outline",
};

export function CampaignsView({
  campaigns,
  leads,
  demos,
  options,
  websites = [],
  analyticsByCampaign,
  timelineByCampaign,
}: {
  campaigns: Campaign[];
  leads: Lead[];
  demos: DemoRecord[];
  options: OptionLists;
  websites?: WebsiteRegistryEntry[];
  analyticsByCampaign: Record<string, TrackingSnapshot>;
  timelineByCampaign: Record<string, { events: TimelineEvent[]; truncatedFrom: number | null }>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(campaigns.find((c) => c.status === "Active")?.id ?? campaigns[0]?.id ?? null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;
  const summary: CampaignMatchSummary | null = selected ? summarizeCampaignMatch(leads, selected) : null;
  const matchingLeads = selected ? filterCampaignLeads(leads, selected) : [];
  const cappedLeads = selected?.maxLeadsPerRun ? matchingLeads.slice(0, selected.maxLeadsPerRun) : matchingLeads;

  async function toggleStatus(campaign: Campaign) {
    setPendingAction(campaign.id);
    await setCampaignStatusAction(campaign.id, campaign.status === "Active" ? "Paused" : "Active");
    router.refresh();
    setPendingAction(null);
  }

  async function remove(campaign: Campaign) {
    if (!window.confirm(`Delete campaign "${campaign.name}"? This only removes the targeting configuration, never any leads.`)) return;
    setPendingAction(campaign.id);
    await deleteCampaignAction(campaign.id);
    if (selectedId === campaign.id) setSelectedId(null);
    router.refresh();
    setPendingAction(null);
  }

  async function duplicate(campaign: Campaign) {
    setPendingAction(campaign.id);
    await duplicateCampaignAction(campaign.id);
    router.refresh();
    setPendingAction(null);
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No campaigns yet"
        description="Create a campaign to define what the outreach workflow should target."
        action={<CampaignFormDialog options={options} demos={demos} websites={websites} />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => {
          const isSelected = campaign.id === selectedId;
          const count = summarizeCampaignMatch(leads, campaign).assigned;
          const criteria = [campaign.country, campaign.industry, campaign.businessType, campaign.service, campaign.leadGenerationType].filter(Boolean) as string[];
          return (
            <Card
              key={campaign.id}
              level={2}
              glow={isSelected && campaign.status === "Active"}
              onClick={() => setSelectedId(campaign.id)}
              className={cn("cursor-pointer p-4 transition-all", isSelected ? "border-accent/50" : "hover:border-border-strong")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-text-primary">{campaign.name}</p>
                    {campaign.isTest && <Badge variant="purple">TEST</Badge>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">Updated {formatDate(campaign.updatedAt)}</p>
                </div>
                <Badge variant={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {criteria.length > 0 ? (
                  criteria.map((c) => (
                    <Badge key={c} variant="outline">
                      {c}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">No targeting notes</Badge>
                )}
                {campaign.minConfidence !== null && <Badge variant="accent">≥{campaign.minConfidence}%</Badge>}
              </div>
              <DemoBadge campaign={campaign} demos={demos} />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Activity className={cn("h-3 w-3", campaign.openTrackingEnabled || campaign.clickTrackingEnabled ? "text-accent-lime" : "text-text-tertiary")} />
                  Tracking {campaign.openTrackingEnabled || campaign.clickTrackingEnabled ? "on" : "off"}
                </span>
                {campaign.maxLeadsPerRun && <span>Max {campaign.maxLeadsPerRun}/run</span>}
                {campaign.dailySendLimit && <span>{campaign.dailySendLimit}/day</span>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5">
                <p className="text-xs text-text-secondary">
                  <span className="font-semibold text-accent-strong">{count}</span> lead{count === 1 ? "" : "s"} assigned
                </p>
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <CampaignFormDialog campaign={campaign} options={options} demos={demos} websites={websites} />
                  <Button variant="ghost" size="sm" onClick={() => toggleStatus(campaign)} disabled={pendingAction === campaign.id}>
                    {campaign.status === "Active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {campaign.status === "Active" ? "Pause" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-text-tertiary"
                    onClick={() => duplicate(campaign)}
                    disabled={pendingAction === campaign.id}
                    aria-label="Duplicate campaign"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-text-tertiary hover:text-danger"
                    onClick={() => remove(campaign)}
                    disabled={pendingAction === campaign.id}
                    aria-label="Delete campaign"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selected && summary && (
        <div className="space-y-6">
          <CampaignPipelineStrip campaign={selected} matchingLeads={matchingLeads} websites={websites} demos={demos} snapshot={analyticsByCampaign[selected.id]} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-6">
              <CampaignSummary summary={summary} />
              {analyticsByCampaign[selected.id] && (
                <>
                  <CampaignAnalyticsCard snapshot={analyticsByCampaign[selected.id]} />
                  <ExportCampaignAnalyticsButton campaignId={selected.id} campaignName={selected.name} />
                </>
              )}
            </div>
  
            <Card className="xl:col-span-2 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-text-primary">Assigned Leads — {selected.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {matchingLeads.length} assigned by Campaign ID
                    {selected.maxLeadsPerRun && matchingLeads.length > selected.maxLeadsPerRun
                      ? ` · showing first ${selected.maxLeadsPerRun} (max per run)`
                      : ""}
                    {selected.dailySendLimit ? ` · daily send limit ${selected.dailySendLimit}` : ""}
                  </p>
                </div>
                {selected.notes && <p className="max-w-sm text-[11px] italic text-text-tertiary">{selected.notes}</p>}
              </div>
              {cappedLeads.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="No leads assigned to this campaign"
                  description="Assign leads to this campaign from the Leads page (Add Lead or Edit Lead) -- assignment is by Campaign ID, never inferred from industry or business type."
                  className="m-5"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-surface-raised text-xs text-text-tertiary">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Company</th>
                        <th className="px-4 py-2.5 font-medium">Country</th>
                        <th className="px-4 py-2.5 font-medium">Business Type</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">Confidence</th>
                        <th className="px-4 py-2.5 font-medium">Last Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {cappedLeads.map((lead) => (
                        <tr key={lead.email} className="group transition-colors hover:bg-panel">
                          <td className="px-4 py-2.5">
                            <Link href={`/leads/${encodeURIComponent(lead.email)}`} className="font-medium text-text-primary group-hover:text-accent">
                              {lead.company}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary">{lead.country || "—"}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{lead.businessType || "—"}</td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={lead.status} />
                          </td>
                          <td className="px-4 py-2.5">
                            <ConfidenceBadge value={lead.confidence} />
                          </td>
                          <td className="px-4 py-2.5 text-text-tertiary">{formatDate(lead.lastContact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <CardContent className="border-t border-border-subtle py-3">
                <p className="text-[11px] text-text-tertiary">
                  This preview only prepares the selection -- sending is always done by the n8n workflow on its own schedule.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {selected && timelineByCampaign[selected.id] && (
        <Card className="overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3.5">
            <p className="text-sm font-semibold text-text-primary">Campaign Timeline — {selected.name}</p>
            <p className="text-xs text-text-tertiary">
              Lifecycle, bounces, complaints, and conversion events — not a full send/open/click log (see Campaign Analytics for aggregate rates)
              {timelineByCampaign[selected.id].truncatedFrom
                ? ` · showing the most recent 100 of ${timelineByCampaign[selected.id].truncatedFrom}`
                : ""}
            </p>
          </div>
          <CardContent className="pt-4">
            <TimelineTab events={timelineByCampaign[selected.id].events} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Small preview of what resolveCampaignDemo() would attach right now (Part C: "show demo name,
 *  demo type, service, status, attachment availability") -- same rule n8n applies at send time. */
function DemoBadge({ campaign, demos }: { campaign: Campaign; demos: DemoRecord[] }) {
  if (!campaign.attachDemo || campaign.demoSelectionMode === "None") {
    return (
      <div className="mt-2">
        <Badge variant="outline">No demo</Badge>
      </div>
    );
  }
  const match = resolveCampaignDemo(campaign, demos);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {match.demo ? (
        <>
          <Badge variant="accent">Demo: {match.demo.name || match.demo.demoType}</Badge>
          <Badge variant="outline">{campaign.demoSelectionMode}</Badge>
        </>
      ) : (
        <Badge variant={match.blocking ? "danger" : "warning"}>
          {campaign.demoSelectionMode} demo: {match.blocking ? "blocked" : "no match"}
        </Badge>
      )}
    </div>
  );
}
