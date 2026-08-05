"use client";

import * as React from "react";
import { History, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listExecutionsAction, type RegistryKind } from "@/lib/actions/workflow-registry";
import type { ExecutionSummary } from "@/types";
import { formatDateTime } from "@/lib/utils/date";
import { useToast } from "@/components/ui/toast";

const STATUS_VARIANT = { success: "success", error: "danger", running: "accent", waiting: "warning", unknown: "outline" } as const;

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function ExecutionsDrawer({ kind, id, n8nEditorUrl }: { kind: RegistryKind; id: string; n8nEditorUrl: string | null }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<ExecutionSummary[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [configured, setConfigured] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>();

  async function load(nextCursor: string | null, append: boolean) {
    setLoading(true);
    const result = await listExecutionsAction(kind, id, nextCursor, 20);
    setConfigured(result.configured);
    setError(result.error);
    setItems((prev) => (append ? [...prev, ...result.items] : result.items));
    setCursor(result.nextCursor);
    setHasMore(result.nextCursor !== null);
    setLoading(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) load(null, false);
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="h-3.5 w-3.5" /> Executions
        </Button>
      </DrawerTrigger>
      <DrawerContent widthClassName="w-full sm:max-w-2xl">
        <DrawerHeader>
          <DrawerTitle>Execution history</DrawerTitle>
          <DrawerDescription>
            Sanitized -- never shows node input/output, payloads, or credentials. Counts (processed/imported) come from the CRM&apos;s own job
            records, not from parsing raw n8n execution data.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="mb-3 flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={() => load(null, false)} disabled={loading}>
              <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
            </Button>
            {n8nEditorUrl && (
              <a href={n8nEditorUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
                Open workflow in n8n <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {!configured && <p className="text-xs text-text-tertiary">n8n admin API is not configured -- set N8N_ADMIN_API_KEY and N8N_BASE_URL to see execution history here.</p>}
          {error && <p className="text-xs text-danger">{error}</p>}

          {configured && !error && items.length === 0 && !loading && <p className="text-xs text-text-tertiary">No executions found for this workflow yet.</p>}

          <div className="space-y-2">
            {items.map((exec) => (
              <div key={exec.id} className="rounded-lg border border-border-subtle bg-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[exec.status]}>{exec.status}</Badge>
                    <span className="font-mono text-xs text-text-tertiary">#{exec.id}</span>
                  </div>
                  <button
                    className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
                    onClick={() => {
                      navigator.clipboard.writeText(exec.id);
                      toast("Execution ID copied.", "success");
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copy ID
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-text-secondary">
                  <div>
                    <p className="text-text-tertiary">Started</p>
                    <p>{formatDateTime(exec.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-text-tertiary">Finished</p>
                    <p>{exec.finishedAt ? formatDateTime(exec.finishedAt) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-text-tertiary">Duration</p>
                    <p>{formatDuration(exec.durationMs)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => load(cursor, true)} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
