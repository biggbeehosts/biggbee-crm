import Link from "next/link";
import { Clapperboard, Globe2, Loader2 } from "lucide-react";
import type { Lead } from "@/types";
import { ConfidenceBadge } from "@/components/ui/status-badge";
import { formatRelativeTime } from "@/lib/utils/date";
import { initials } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function KanbanCard({
  lead,
  campaignName,
  dragging,
  saving,
}: {
  lead: Lead;
  campaignName?: string | null;
  dragging?: boolean;
  saving?: boolean;
}) {
  return (
    <Link
      href={`/leads/${encodeURIComponent(lead.email)}`}
      aria-disabled={saving}
      className={cn(
        "relative block rounded-xl border border-border-subtle bg-surface-raised p-3 transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-md hover:shadow-black/25",
        dragging && "opacity-40",
        saving && "pointer-events-none opacity-70"
      )}
    >
      {saving && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-[10px] font-semibold text-text-secondary">
            {initials(lead.company)}
          </span>
          <p className="truncate text-xs font-medium text-text-primary">{lead.company}</p>
        </div>
        {!saving && lead.demoVideoAttached && <Clapperboard className="h-3.5 w-3.5 shrink-0 text-accent" />}
      </div>
      <p className="mt-1.5 truncate text-[11px] text-text-tertiary">{lead.name}</p>
      {(lead.serviceOffered || lead.leadGenerationType) && (
        <div className="mt-1 flex items-center gap-1 overflow-hidden">
          {lead.serviceOffered && <span className="truncate text-[11px] text-accent-strong">{lead.serviceOffered}</span>}
          {lead.serviceOffered && lead.leadGenerationType && <span className="shrink-0 text-[11px] text-text-tertiary">·</span>}
          {lead.leadGenerationType && <span className="shrink-0 truncate text-[11px] text-text-tertiary">{lead.leadGenerationType}</span>}
        </div>
      )}
      {(campaignName || lead.source) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {campaignName && (
            <span className="truncate rounded border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-strong">
              {campaignName}
            </span>
          )}
          {lead.source && (
            <span className="truncate rounded border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-tertiary">{lead.source}</span>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <Globe2 className="h-3 w-3" />
          {lead.country || "—"}
        </div>
        <ConfidenceBadge value={lead.confidence} />
      </div>
      <p className="mt-1.5 text-[10px] text-text-tertiary">{lead.lastContact ? `Contacted ${formatRelativeTime(lead.lastContact)}` : "Not contacted yet"}</p>
    </Link>
  );
}
