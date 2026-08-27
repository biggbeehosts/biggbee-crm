import Link from "next/link";
import { UsersRound, Rocket, Send, MailOpen, UserPlus } from "lucide-react";
import type { Campaign } from "@/types";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/ui/icon-badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils/format";

function HighlightCard({
  eyebrow,
  icon: Icon,
  tone,
  glow,
  children,
  href,
}: {
  eyebrow: string;
  icon: typeof UsersRound;
  tone: "info" | "accent" | "success";
  glow?: boolean;
  children: React.ReactNode;
  href?: string;
}) {
  const content = (
    <Card level={1} glow={glow} className="h-full p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={Icon} tone={tone} />
        <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">{eyebrow}</p>
      </div>
      <div className="mt-3.5">{children}</div>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

/** The 3 primary highlight cards -- deliberately the most visually dominant thing on the
 *  Dashboard (Section 2 of the final polish brief). Zero leads / no campaign / zero eligible are
 *  all expected first-run states here, never warning-styled -- only a genuine infra failure
 *  (readiness.infraBlocked) gets amber treatment on the Campaign card. */
export function DashboardHighlights({
  eligibleLeads,
  totalLeads,
  campaign,
  readiness,
  emailsSent,
  replies,
  meetings,
}: {
  eligibleLeads: number;
  totalLeads: number;
  campaign: Campaign | null;
  readiness: CampaignReadiness;
  emailsSent: number;
  replies: number;
  meetings: number;
}) {
  const sendLimit = campaign?.maxLeadsPerRun ?? campaign?.dailySendLimit ?? null;
  const noEligibleLeads = campaign && (readiness.campaignMatches === 0 || eligibleLeads === 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <HighlightCard eyebrow="Leads Ready" icon={UsersRound} tone="info" href={totalLeads > 0 ? "/leads" : undefined} glow={eligibleLeads > 0}>
        <p className="text-5xl font-extrabold leading-none tracking-tight text-text-primary">{formatNumber(eligibleLeads)}</p>
        <p className="mt-2 text-xs text-text-tertiary">eligible for outreach · {formatNumber(totalLeads)} total leads</p>
        {totalLeads === 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border-subtle pt-3">
            <p className="w-full text-[11px] text-text-secondary">Add leads to begin.</p>
            <Button size="sm" variant="secondary" asChild>
              <Link href="/leads">
                <UserPlus className="h-3.5 w-3.5" /> Add Leads
              </Link>
            </Button>
          </div>
        )}
      </HighlightCard>

      <HighlightCard eyebrow="Campaign" icon={Rocket} tone="accent" glow={Boolean(campaign) && readiness.canRun}>
        {campaign ? (
          <>
            <p className="truncate text-2xl font-bold tracking-tight text-text-primary">{campaign.name}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {readiness.infraBlocked ? (
                <Badge variant="warning">{readiness.blockReasons[0] ?? "Needs attention"}</Badge>
              ) : readiness.canRun ? (
                <Badge variant="success">Ready</Badge>
              ) : (
                <Badge variant="outline">{noEligibleLeads ? "No eligible leads yet" : "Checks when you run"}</Badge>
              )}
              {sendLimit !== null && <span className="text-[11px] text-text-tertiary">Limit {sendLimit}/run</span>}
            </div>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tracking-tight text-text-primary">Choose a campaign</p>
            <p className="mt-1 text-xs text-text-tertiary">Select or create one below to start outreach.</p>
          </>
        )}
      </HighlightCard>

      <HighlightCard eyebrow="Outreach" icon={Send} tone="success" href="/outreach" glow={emailsSent > 0}>
        <div className="flex items-baseline gap-2">
          <p className="text-5xl font-extrabold leading-none tracking-tight text-text-primary">{formatNumber(emailsSent)}</p>
          <span className="text-xs text-text-tertiary">sent</span>
        </div>
        <div className="mt-2.5 flex items-center gap-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-1">
            <MailOpen className="h-3 w-3" /> {formatNumber(replies)} replies
          </span>
          <span>{formatNumber(meetings)} meetings</span>
        </div>
      </HighlightCard>
    </div>
  );
}
