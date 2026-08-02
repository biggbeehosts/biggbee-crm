import Link from "next/link";
import { Clapperboard, Globe2 } from "lucide-react";
import type { Lead } from "@/types";
import { ConfidenceBadge } from "@/components/ui/status-badge";
import { formatRelativeTime } from "@/lib/utils/date";
import { initials } from "@/lib/utils/format";

export function KanbanCard({ lead, dragging }: { lead: Lead; dragging?: boolean }) {
  return (
    <Link
      href={`/leads/${encodeURIComponent(lead.email)}`}
      className={`block rounded-xl border border-border-subtle bg-surface-raised p-3 transition-shadow hover:border-border-strong hover:shadow-md hover:shadow-black/20 ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-[10px] font-semibold text-text-secondary">
            {initials(lead.company)}
          </span>
          <p className="truncate text-xs font-medium text-text-primary">{lead.company}</p>
        </div>
        {lead.demoVideoAttached && <Clapperboard className="h-3.5 w-3.5 shrink-0 text-accent" />}
      </div>
      <p className="mt-1.5 truncate text-[11px] text-text-tertiary">{lead.name}</p>
      {lead.serviceOffered && <p className="mt-1 truncate text-[11px] text-accent">{lead.serviceOffered}</p>}
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
