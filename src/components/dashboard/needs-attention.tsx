import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { AttentionItem } from "@/lib/calculations/activity";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <Card id="needs-attention">
      <CardHeader>
        <div>
          <CardTitle>Needs Attention</CardTitle>
          <CardDescription>Failed sends, low-confidence leads and missing data</CardDescription>
        </div>
        {items.length > 0 && <Badge variant="warning">{items.length}</Badge>}
      </CardHeader>
      <div className="max-h-[380px] overflow-y-auto px-5 pb-5">
        {items.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All caught up" description="No leads currently need attention." />
        ) : (
          <ul className="space-y-1">
            {items.slice(0, 15).map((item) => (
              <li key={item.id}>
                <Link
                  href={item.leadEmail ? `/leads/${encodeURIComponent(item.leadEmail)}` : "/errors"}
                  className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-panel"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.severity === "high" ? "bg-danger" : "bg-warning"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-primary">{item.title}</p>
                    <p className="truncate text-[11px] text-text-tertiary">{item.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
