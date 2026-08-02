import type { ErrorRecord } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/date";
import { CheckCircle2 } from "lucide-react";

export function ErrorsTab({ errors }: { errors: ErrorRecord[] }) {
  if (errors.length === 0) {
    return <EmptyState icon={CheckCircle2} title="No errors for this lead" description="This lead has never triggered a validation or send error." />;
  }

  return (
    <div className="space-y-3">
      {errors.map((err) => (
        <Card key={err.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">{err.errorMessage}</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {err.source} · {err.nodeName} · {formatDateTime(err.timestamp)}
                </p>
              </div>
              <Badge variant="danger">{err.source}</Badge>
            </div>
            {(err.validationErrors?.length || err.validationWarnings?.length) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {err.validationErrors?.map((v) => (
                  <Badge key={v} variant="danger">
                    {v}
                  </Badge>
                ))}
                {err.validationWarnings?.map((v) => (
                  <Badge key={v} variant="warning">
                    {v}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
