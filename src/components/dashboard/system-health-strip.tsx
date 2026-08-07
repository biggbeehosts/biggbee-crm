import type { ProviderHealthRow } from "@/lib/providers/registry";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface HealthModule {
  label: string;
  ok: boolean;
  detail?: string;
}

function toModule(p: ProviderHealthRow): HealthModule {
  return { label: p.name, ok: p.configured && p.connected, detail: p.error ?? p.detail };
}

/** System-status instrumentation strip -- every real provider adapter (Google Sheets, n8n,
 *  Cloudinary) plus the Knowledge Base freshness signal, rendered as individual status modules
 *  (not a plain inline pill row) so it reads as command-center instrumentation. */
export function SystemHealthStrip({ providers, knowledgeBaseHealthy }: { providers: ProviderHealthRow[]; knowledgeBaseHealthy: boolean }) {
  const modules: HealthModule[] = [
    ...providers.map(toModule),
    { label: "Knowledge Base", ok: knowledgeBaseHealthy, detail: knowledgeBaseHealthy ? undefined : "Hasn't synced in the last day" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {modules.map((m) => (
        <Card key={m.label} level={2} glow={m.ok} className="flex items-center gap-2.5 px-3 py-2.5" title={m.detail}>
          <span className="relative flex h-2 w-2 shrink-0">
            {m.ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", m.ok ? "bg-accent" : "bg-warning")} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-text-primary">{m.label}</p>
            <p className={cn("text-[10px] font-medium", m.ok ? "text-accent" : "text-warning")}>{m.ok ? "Live" : "Needs attention"}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
