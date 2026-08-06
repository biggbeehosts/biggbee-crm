import type { ProviderHealthRow } from "@/lib/providers/registry";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface HealthPill {
  label: string;
  ok: boolean;
  detail?: string;
}

function toPill(p: ProviderHealthRow): HealthPill {
  return { label: p.name, ok: p.configured && p.connected, detail: p.error ?? p.detail };
}

/** Compact system-health row -- every real provider adapter the CRM has (Google Sheets, n8n,
 *  Cloudinary) plus the Knowledge Base freshness signal already fetched on the dashboard. Never
 *  fabricates a health check for something the CRM doesn't actually call (see providers/types.ts) --
 *  Tracking/Deliverability aren't external providers, so they're not represented here. */
export function SystemHealthStrip({ providers, knowledgeBaseHealthy }: { providers: ProviderHealthRow[]; knowledgeBaseHealthy: boolean }) {
  const pills: HealthPill[] = [
    ...providers.map(toPill),
    { label: "Knowledge Base", ok: knowledgeBaseHealthy, detail: knowledgeBaseHealthy ? undefined : "Hasn't synced in the last day" },
  ];

  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">System Health</span>
      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        {pills.map((p) => (
          <div key={p.label} className="flex items-center gap-1.5" title={p.detail}>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.ok ? "bg-success" : "bg-warning")} />
            <span className="text-xs text-text-secondary">{p.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
