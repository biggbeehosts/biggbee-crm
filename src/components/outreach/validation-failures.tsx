import Link from "next/link";
import type { ErrorRecord } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { ShieldCheck } from "lucide-react";

export function ValidationFailures({ errors }: { errors: ErrorRecord[] }) {
  const validation = errors.filter((e) => e.source === "AI Output Validation" || e.source === "Lead Validation");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Validation Failures</CardTitle>
          <CardDescription>Leads skipped before sending because required fields were missing</CardDescription>
        </div>
      </CardHeader>
      <div className="px-5 pb-5">
        {validation.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No validation failures" />
        ) : (
          <ul className="space-y-2">
            {validation.map((err) => (
              <li key={err.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-text-primary">
                    {err.leadEmail ? (
                      <Link href={`/leads/${encodeURIComponent(err.leadEmail)}`} className="hover:text-accent">
                        {err.company || err.leadEmail}
                      </Link>
                    ) : (
                      err.company || "Unknown lead"
                    )}
                  </p>
                  <span className="shrink-0 text-[11px] text-text-tertiary">{formatDateTime(err.timestamp)}</span>
                </div>
                <p className="mt-1 text-[11px] text-text-tertiary">{err.errorMessage}</p>
                {err.validationErrors && err.validationErrors.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {err.validationErrors.map((v) => (
                      <Badge key={v} variant="danger">
                        {v}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
