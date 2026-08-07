import Link from "next/link";
import { UsersRound, Rocket, Send, MailOpen } from "lucide-react";
import type { Campaign } from "@/types";
import type { CampaignReadiness } from "@/lib/calculations/campaign-readiness";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/ui/icon-badge";
import { formatNumber } from "@/lib/utils/format";

/** Turns a raw block reason into calm, operational phrasing instead of "BLOCKED"/"ERROR" --
 *  see campaign-readiness.ts's blockReasons, which are already plain English; this just picks the
 *  shortest, most actionable one to headline (Section 17 of the polish brief). */
function primaryBlockReason(readiness: CampaignReadiness): string {
  const reason = readiness.blockReasons[0] ?? "";
  if (/no eligible leads/i.test(reason)) return "No eligible leads";
  if (/select a campaign/i.test(reason)) return "No campaign selected";
  if (/no leads assigned/i.test(reason)) return "No leads assigned yet";
  if (/google sheets/i.test(reason)) return "Google Sheets not connected";
  if (/not connected to n8n/i.test(reason)) return "n8n not connected";
  return reason || "Needs attention";
}

function HighlightCard({
  eyebrow,
  icon: Icon,
  tone,
  children,
  href,
}: {
  eyebrow: string;
  icon: typeof UsersRound;
  tone: "info" | "accent" | "success";
  children: React.ReactNode;
  href?: string;
}) {
  const content = (
    <Card level={1} className="h-full p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={Icon} tone={tone} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{eyebrow}</p>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <HighlightCard eyebrow="Leads Ready" icon={UsersRound} tone="info" href="/leads">
        <p className="text-4xl font-extrabold tracking-tight text-text-primary">{formatNumber(eligibleLeads)}</p>
        <p className="mt-1 text-xs text-text-tertiary">eligible for outreach · {formatNumber(totalLeads)} total leads</p>
      </HighlightCard>

      <HighlightCard eyebrow="Campaign" icon={Rocket} tone="accent">
        {campaign ? (
          <>
            <p className="truncate text-xl font-bold tracking-tight text-text-primary">{campaign.name}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={readiness.canRun ? "success" : "warning"}>{readiness.canRun ? "Ready" : primaryBlockReason(readiness)}</Badge>
              {sendLimit !== null && <span className="text-[11px] text-text-tertiary">Limit {sendLimit}/run</span>}
            </div>
          </>
        ) : (
          <>
            <p className="text-xl font-bold tracking-tight text-text-primary">No active campaign</p>
            <p className="mt-1 text-xs text-text-tertiary">Create and activate one to start outreach.</p>
          </>
        )}
      </HighlightCard>

      <HighlightCard eyebrow="Outreach" icon={Send} tone="success" href="/outreach">
        <div className="flex items-baseline gap-2">
          <p className="text-4xl font-extrabold tracking-tight text-text-primary">{formatNumber(emailsSent)}</p>
          <span className="text-xs text-text-tertiary">sent</span>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-1">
            <MailOpen className="h-3 w-3" /> {formatNumber(replies)} replies
          </span>
          <span>{formatNumber(meetings)} meetings</span>
        </div>
      </HighlightCard>
    </div>
  );
}
