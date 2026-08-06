import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { ErrorRecord } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/utils/date";
import { severityOf, SEVERITY_BADGE } from "@/lib/calculations/error-severity";

/** `errors` here is already filtered to what's current and actionable (see
 *  summarizeDashboardErrors) -- never the raw, full Errors sheet history. `hiddenCount` is purely
 *  informational: older/repeat/internal-test entries that still live in full on the Errors page. */
export function RecentErrors({ errors, hiddenCount = 0 }: { errors: ErrorRecord[]; hiddenCount?: number }) {
  const recent = errors.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Needs Attention</CardTitle>
          <CardDescription>Current issues from the last few days -- full history stays on Errors</CardDescription>
        </div>
        <Link href="/errors" className="text-xs font-medium text-accent hover:underline">
          View all{hiddenCount > 0 ? ` (${hiddenCount} more)` : ""}
        </Link>
      </CardHeader>
      <div className="max-h-[380px] overflow-y-auto px-5 pb-5">
        {recent.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All clear" description="No current issues in the last few days." />
        ) : (
          <ul className="space-y-1">
            {recent.map((err) => {
              const severity = severityOf(err);
              return (
                <li key={err.id}>
                  <Link
                    href={err.leadEmail ? `/leads/${encodeURIComponent(err.leadEmail)}` : "/errors"}
                    className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-panel"
                  >
                    <Badge variant={SEVERITY_BADGE[severity]} className="mt-0.5 shrink-0">
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
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
