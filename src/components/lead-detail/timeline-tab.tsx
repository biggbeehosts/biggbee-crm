"use client";

import * as React from "react";
import type { TimelineEvent } from "@/lib/calculations/timeline";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { History, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONE_DOT: Record<TimelineEvent["tone"], string> = {
  default: "bg-slate-400",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
};

export function TimelineTab({ events }: { events: TimelineEvent[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (events.length === 0) {
    return <EmptyState icon={History} title="No timeline events yet" description="Activity will appear here once this lead is contacted." />;
  }

  return (
    <ol className="relative space-y-5 border-l border-border-subtle pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className={cn("absolute -left-[29px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface", TONE_DOT[event.tone])} />
          <p className="text-xs text-text-tertiary">{formatDateTime(event.timestamp)}</p>
          <p className="mt-0.5 text-sm font-medium text-text-primary">{event.label}</p>
          {event.description && <p className="mt-0.5 text-xs text-text-secondary">{event.description}</p>}
          {event.raw && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-text-tertiary hover:text-text-primary"
              >
                {expanded === event.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                View raw event
              </button>
              {expanded === event.id && (
                <pre className="mt-1.5 max-w-full overflow-x-auto rounded-md border border-border-subtle bg-surface-raised p-2 text-[10px] text-text-secondary">
                  {JSON.stringify(
                    {
                      source: event.raw.source,
                      providerEventId: event.raw.providerEventId,
                      n8nExecutionId: event.raw.n8nExecutionId,
                      isUnique: event.raw.isUnique,
                      isBotOrScanner: event.raw.isBotOrScanner,
                      isTestEvent: event.raw.isTestEvent,
                      metadata: event.raw.metadata,
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
