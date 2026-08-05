"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, ListTree, RefreshCw, Shield, Trash2 } from "lucide-react";
import type { KnowledgeBaseRecord, WebsiteRegistryEntry } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { useToast } from "@/components/ui/toast";
import { syncWebsiteAction, deleteWebsiteAction } from "@/lib/actions/website-registry";
import { WebsiteFormDialog, WebsiteEditTrigger } from "./website-form-dialog";
import { KnowledgeBaseView } from "./kb-view";
import type { WebsiteSyncLogEntry } from "@/lib/data/website-sync-log-store";

const SYNC_STATUS_VARIANT = { "never-synced": "outline", syncing: "accent", idle: "success", failed: "danger" } as const;

export function WebsiteRegistryView({
  websites,
  kbByWebsiteId,
  syncLog,
  refreshKbConfigured,
}: {
  websites: WebsiteRegistryEntry[];
  kbByWebsiteId: Record<string, KnowledgeBaseRecord>;
  syncLog: WebsiteSyncLogEntry[];
  refreshKbConfigured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(websites.find((w) => w.isDefault)?.id ?? websites[0]?.id ?? null);
  const [pending, setPending] = React.useState<string | null>(null);

  const selected = websites.find((w) => w.id === selectedId) ?? null;

  async function sync(site: WebsiteRegistryEntry) {
    setPending(site.id);
    const result = await syncWebsiteAction(site.id);
    setPending(null);
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
  }

  async function remove(site: WebsiteRegistryEntry) {
    if (!window.confirm(`Remove "${site.label}" from the Website Registry?`)) return;
    setPending(site.id);
    const result = await deleteWebsiteAction(site.id);
    setPending(null);
    toast(result.message, result.success ? "success" : "error");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-text-tertiary" />
            <p className="text-sm font-semibold text-text-primary">Website Registry</p>
          </div>
          <WebsiteFormDialog />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wide text-text-tertiary">
                <th className="px-5 py-2.5 font-medium">Website</th>
                <th className="px-3 py-2.5 font-medium">Pages Indexed</th>
                <th className="px-3 py-2.5 font-medium">Last Sync</th>
                <th className="px-3 py-2.5 font-medium">Sync Status</th>
                <th className="px-3 py-2.5 font-medium">Webhook</th>
                <th className="px-3 py-2.5 font-medium">Auto / Daily</th>
                <th className="px-5 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {websites.map((site) => (
                <tr
                  key={site.id}
                  onClick={() => setSelectedId(site.id)}
                  className={`cursor-pointer border-b border-border-subtle last:border-0 hover:bg-panel ${selectedId === site.id ? "bg-accent-soft/30" : ""}`}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-text-primary">{site.label}</p>
                    <p className="text-xs text-text-tertiary">{site.url}</p>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{site.pagesIndexed}</td>
                  <td className="px-3 py-3 text-text-secondary" title={site.lastSyncAt ? formatDateTime(site.lastSyncAt) : undefined}>
                    {site.lastSyncAt ? formatRelativeTime(site.lastSyncAt) : "Never"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={SYNC_STATUS_VARIANT[site.syncStatus]}>{site.syncStatus}</Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-text-tertiary">{site.webhookEnvVar || site.webhookPath || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <Badge variant={site.autoSyncEnabled ? "success" : "outline"}>Auto</Badge>
                      <Badge variant={site.dailySyncEnabled ? "success" : "outline"}>Daily</Badge>
                    </div>
                  </td>
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => sync(site)} disabled={pending !== null}>
                        <RefreshCw className={pending === site.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Sync
                      </Button>
                      <WebsiteEditTrigger site={site} />
                      {!site.isDefault && (
                        <Button variant="ghost" size="sm" onClick={() => remove(site)} disabled={pending !== null}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-text-tertiary" />
            <p className="text-sm font-semibold text-text-primary">{selected.label} — Knowledge Base</p>
          </div>
          <KnowledgeBaseView kb={kbByWebsiteId[selected.id] ?? { cacheKey: selected.cacheKey, knowledgeBaseText: "", updatedAt: null, sourceCount: 0, sections: [] }} refreshKbConfigured={selected.isDefault && refreshKbConfigured} />
        </div>
      )}

      <Card>
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-3.5">
          <ListTree className="h-4 w-4 text-text-tertiary" />
          <p className="text-sm font-semibold text-text-primary">Sync Queue</p>
          <p className="ml-auto text-xs text-text-tertiary">Last {syncLog.length} attempt{syncLog.length === 1 ? "" : "s"}</p>
        </div>
        <CardContent className="p-0">
          {syncLog.length === 0 ? (
            <EmptyState icon={ListTree} title="No sync attempts yet" description="Manual or automatic syncs will show up here." />
          ) : (
            <div className="divide-y divide-border-subtle">
              {syncLog.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{entry.websiteLabel}</p>
                    <p className="truncate text-text-tertiary">{entry.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={entry.outcome === "success" ? "success" : "danger"}>{entry.outcome}</Badge>
                    <span className="text-text-tertiary" title={formatDateTime(entry.at)}>
                      {formatRelativeTime(entry.at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
