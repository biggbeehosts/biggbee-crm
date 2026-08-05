import * as React from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, Clapperboard, Globe, Send } from "lucide-react";
import type { Campaign, DemoRecord, Lead, WebsiteRegistryEntry } from "@/types";
import { resolveCampaignDemo } from "@/lib/calculations/demo-match";
import type { TrackingSnapshot } from "@/lib/calculations/tracking-metrics";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Stage 6: Campaign is the primary object every automation threads through --
 * Lead Source -> Website -> Knowledge Base -> Demo Library -> Email Automation -> Analytics.
 * Every value here is derived from data the campaign detail view already fetches; this component
 * adds no new data source, it only surfaces the existing chain in one place.
 */
export function CampaignPipelineStrip({
  campaign,
  matchingLeads,
  websites,
  demos,
  snapshot,
}: {
  campaign: Campaign;
  matchingLeads: Lead[];
  websites: WebsiteRegistryEntry[];
  demos: DemoRecord[];
  snapshot: TrackingSnapshot | undefined;
}) {
  const sources = Array.from(new Set(matchingLeads.map((l) => l.source).filter(Boolean))) as string[];
  const website = websites.find((w) => w.id === campaign.websiteId);
  const demoResult = resolveCampaignDemo(campaign, demos);
  const sent = snapshot?.kpis.emailsSent ?? 0;

  const steps: { icon: typeof Bot; label: string; detail: string; tone: "success" | "warning" | "outline" }[] = [
    {
      icon: Bot,
      label: "Lead Source",
      detail: sources.length > 0 ? `${matchingLeads.length} leads via ${sources.join(", ")}` : "No scraped leads yet",
      tone: sources.length > 0 ? "success" : "outline",
    },
    {
      icon: Globe,
      label: "Website / KB",
      detail: website ? `${website.label} (${website.syncStatus})` : "Default Biggbees.com KB",
      tone: website ? (website.syncStatus === "idle" ? "success" : website.syncStatus === "failed" ? "warning" : "outline") : "outline",
    },
    {
      icon: Clapperboard,
      label: "Demo Library",
      detail: !campaign.attachDemo ? "Disabled" : demoResult.demo ? demoResult.demo.name || demoResult.demo.demoType : demoResult.blocking ? "Blocking -- no match" : "No demo attached",
      tone: !campaign.attachDemo ? "outline" : demoResult.demo ? "success" : demoResult.blocking ? "warning" : "outline",
    },
    {
      icon: Send,
      label: "Email Automation",
      detail: sent > 0 ? `${sent} sent` : "No sends yet",
      tone: sent > 0 ? "success" : "outline",
    },
    {
      icon: BarChart3,
      label: "Analytics",
      detail: snapshot?.lastActivityAt ? "View campaign analytics" : "No activity yet",
      tone: snapshot?.lastActivityAt ? "success" : "outline",
    },
  ];

  return (
    <Card className="overflow-x-auto p-4">
      <div className="flex min-w-max items-center gap-1.5">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="flex min-w-[128px] flex-col items-start gap-1 rounded-lg bg-panel px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-tertiary">
                <step.icon className="h-3 w-3" /> {step.label}
              </div>
              <Badge variant={step.tone}>{step.detail}</Badge>
            </div>
            {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
          </React.Fragment>
        ))}
        <Link href={`/analytics?campaignId=${encodeURIComponent(campaign.id)}`} className="ml-2 shrink-0 text-xs font-medium text-accent hover:underline">
          Open Analytics →
        </Link>
      </div>
    </Card>
  );
}
