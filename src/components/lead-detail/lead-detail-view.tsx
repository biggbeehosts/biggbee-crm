"use client";

import type { Campaign, ErrorRecord, Lead, LeadMemory } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadHeader } from "./lead-header";
import { OverviewTab } from "./overview-tab";
import { TimelineTab } from "./timeline-tab";
import { EmailHistoryTab } from "./email-history-tab";
import { MemoryTab } from "./memory-tab";
import { ErrorsTab } from "./errors-tab";
import { buildLeadTimeline } from "@/lib/calculations/timeline";

export function LeadDetailView({
  lead,
  memory,
  errors,
  campaigns,
}: {
  lead: Lead;
  memory: LeadMemory | undefined;
  errors: ErrorRecord[];
  campaigns: Campaign[];
}) {
  const timeline = buildLeadTimeline(lead, memory, errors);
  const campaignName = campaigns.find((c) => c.id === lead.campaignId)?.name ?? null;

  return (
    <div>
      <LeadHeader lead={lead} campaigns={campaigns} campaignName={campaignName} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="email">Email History</TabsTrigger>
          <TabsTrigger value="memory">Lead Memory</TabsTrigger>
          <TabsTrigger value="errors">Errors {errors.length > 0 && `(${errors.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab lead={lead} campaignName={campaignName} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab events={timeline} />
        </TabsContent>
        <TabsContent value="email">
          <EmailHistoryTab lead={lead} />
        </TabsContent>
        <TabsContent value="memory">
          <MemoryTab memory={memory} />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTab errors={errors} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
