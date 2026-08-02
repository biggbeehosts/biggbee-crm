import type { TimelineEvent } from "@/lib/calculations/timeline";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { History } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONE_DOT: Record<TimelineEvent["tone"], string> = {
  default: "bg-slate-400",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
};

export function TimelineTab({ events }: { events: TimelineEvent[] }) {
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
        </li>
      ))}
    </ol>
  );
}
