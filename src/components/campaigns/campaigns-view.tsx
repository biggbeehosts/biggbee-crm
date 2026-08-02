"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Play, Target, Trash2 } from "lucide-react";
import type { Campaign, CampaignMatchSummary, Lead, OptionLists } from "@/types";
import { filterCampaignLeads, summarizeCampaignMatch } from "@/lib/calculations/campaign-match";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { CampaignFormDialog } from "./campaign-form-dialog";
import { CampaignSummary } from "./campaign-summary";
import { deleteCampaignAction, setCampaignStatusAction } from "@/lib/actions/campaigns";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const STATUS_TONE: Record<Campaign["status"], "success" | "warning" | "outline"> = {
  Active: "success",
  Paused: "warning",
  Draft: "outline",
};

export function CampaignsView({ campaigns, leads, options }: { campaigns: Campaign[]; leads: Lead[]; options: OptionLists }) {
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

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No campaigns yet"
        description="Create a campaign to define what the outreach workflow should target."
        action={<CampaignFormDialog options={options} />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => {
          const isSelected = campaign.id === selectedId;
          const count = summarizeCampaignMatch(leads, campaign).matching;
          const criteria = [campaign.country, campaign.industry, campaign.businessType, campaign.service, campaign.leadGenerationType].filter(Boolean) as string[];
          return (
            <Card
              key={campaign.id}
              onClick={() => setSelectedId(campaign.id)}
              className={cn("cursor-pointer p-4 transition-colors", isSelected ? "border-accent/50 bg-accent-soft/30" : "hover:border-border-strong")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{campaign.name}</p>
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
                  <Badge variant="outline">All leads</Badge>
                )}
                {campaign.minConfidence !== null && <Badge variant="accent">≥{campaign.minConfidence}%</Badge>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5">
                <p className="text-xs text-text-secondary">
                  <span className="font-semibold text-accent-strong">{count}</span> matching lead{count === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <CampaignFormDialog campaign={campaign} options={options} />
                  <Button variant="ghost" size="sm" onClick={() => toggleStatus(campaign)} disabled={pendingAction === campaign.id}>
                    {campaign.status === "Active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {campaign.status === "Active" ? "Pause" : "Activate"}
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
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <CampaignSummary summary={summary} />

          <Card className="xl:col-span-2 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold text-text-primary">Matching Leads — {selected.name}</p>
                <p className="text-xs text-text-tertiary">
                  {matchingLeads.length} match
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
                title="No leads match this campaign"
                description="Loosen a criterion or lower the confidence threshold to widen the selection."
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
      )}
    </div>
  );
}
