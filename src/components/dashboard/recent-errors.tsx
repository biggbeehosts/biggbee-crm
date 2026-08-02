import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { ErrorRecord } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime, compareDatesEmptyLast } from "@/lib/utils/date";

export function RecentErrors({ errors }: { errors: ErrorRecord[] }) {
  const recent = [...errors].sort((a, b) => -compareDatesEmptyLast(a.timestamp, b.timestamp)).slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent Errors</CardTitle>
          <CardDescription>Latest entries from the workflow&apos;s Errors sheet</CardDescription>
        </div>
        <Link href="/errors" className="text-xs font-medium text-accent hover:underline">
          View all
        </Link>
      </CardHeader>
      <div className="max-h-[380px] overflow-y-auto px-5 pb-5">
        {recent.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No errors logged" description="The workflow hasn't reported any errors." />
        ) : (
          <ul className="space-y-1">
            {recent.map((err) => (
              <li key={err.id}>
                <Link
                  href={err.leadEmail ? `/leads/${encodeURIComponent(err.leadEmail)}` : "/errors"}
                  className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-panel"
                >
                  <Badge variant="danger" className="mt-0.5 shrink-0">
                    {err.source || "Error"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary">{err.errorMessage || "No message recorded"}</p>
                    {(err.company || err.leadEmail) && (
                      <p className="truncate text-[11px] text-text-tertiary">
                        {err.company}
                        {err.company && err.leadEmail ? " · " : ""}
                        {err.leadEmail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-text-tertiary">{formatRelativeTime(err.timestamp)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
