import Link from "next/link";
import { Send, XCircle, UserPlus, Clapperboard, BrainCircuit, ShieldAlert, CalendarCheck2, Reply } from "lucide-react";
import type { ActivityRecord, ActivityType } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const ACTIVITY_META: Record<ActivityType, { icon: typeof Send; tone: string }> = {
  email_sent: { icon: Send, tone: "bg-accent-soft text-accent-strong" },
  email_failed: { icon: XCircle, tone: "bg-danger/10 text-danger" },
  lead_added: { icon: UserPlus, tone: "bg-panel text-text-secondary" },
  demo_assigned: { icon: Clapperboard, tone: "bg-violet-500/10 text-violet-300" },
  memory_updated: { icon: BrainCircuit, tone: "bg-emerald-500/10 text-emerald-300" },
  validation_failed: { icon: ShieldAlert, tone: "bg-warning/10 text-warning" },
  reply_received: { icon: Reply, tone: "bg-sky-500/10 text-sky-300" },
  meeting_booked: { icon: CalendarCheck2, tone: "bg-success/10 text-success" },
};

export function RecentActivity({ activity }: { activity: ActivityRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events across sends, memory and validation</CardDescription>
        </div>
      </CardHeader>
      <div className="max-h-[380px] overflow-y-auto px-5 pb-5">
        {activity.length === 0 ? (
          <EmptyState title="No activity yet" description="Activity will appear here once the workflow starts running." />
        ) : (
          <ul className="space-y-1">
            {activity.map((event) => {
              const meta = ACTIVITY_META[event.type];
              const Icon = meta.icon;
              const content = (
                <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-panel">
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", meta.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary">{event.title}</p>
                    {event.description && <p className="truncate text-[11px] text-text-tertiary">{event.description}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-text-tertiary">{formatRelativeTime(event.timestamp)}</span>
                </div>
              );
              return (
                <li key={event.id}>
                  {event.leadEmail ? <Link href={`/leads/${encodeURIComponent(event.leadEmail)}`}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
