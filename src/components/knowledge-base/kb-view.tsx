"use client";

import * as React from "react";
import type { KnowledgeBaseRecord } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { daysSince, formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { downloadTextFile } from "@/lib/utils/csv";
import { useN8nAction } from "@/lib/n8n/hooks";
import { BookOpen, Check, ChevronDown, ChevronRight, Copy, Download, FileText, Layers, RefreshCw, Search } from "lucide-react";

export function KnowledgeBaseView({ kb, refreshKbConfigured }: { kb: KnowledgeBaseRecord; refreshKbConfigured: boolean }) {
  const [search, setSearch] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [copied, setCopied] = React.useState(false);
  const { run, pendingAction } = useN8nAction({ refreshKb: refreshKbConfigured });
  const kbSyncing = pendingAction === "refreshKb";

  const age = daysSince(kb.updatedAt);
  const fresh = age !== null && age <= 1;

  const filteredSections = kb.sections.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q);
  });

  function toggle(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function copyAll() {
    await navigator.clipboard.writeText(kb.knowledgeBaseText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Last Fetched" value={formatRelativeTime(kb.updatedAt)} icon={RefreshCw} hint={formatDateTime(kb.updatedAt)} tone={fresh ? "success" : "warning"} />
        <StatCard label="Source Sections" value={kb.sourceCount} icon={Layers} />
        <StatCard label="Content Length" value={`${Math.round(kb.knowledgeBaseText.length / 1000)}k chars`} icon={FileText} />
        <Card className="flex items-center justify-center p-5">
          <div className="text-center">
            <Badge variant={fresh ? "success" : "warning"}>{fresh ? "In sync" : "May be stale"}</Badge>
            <p className="mt-1.5 text-[11px] text-text-tertiary">Refreshed automatically on every n8n run</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search within the knowledge base…" className="pl-8" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("refreshKb")}
            disabled={kbSyncing || !refreshKbConfigured}
            title={refreshKbConfigured ? undefined : "Set N8N_WEBHOOK_REFRESH_KB in .env.production to enable this."}
          >
            <RefreshCw className={kbSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {kbSyncing ? "Syncing…" : "Refresh knowledge base"}
          </Button>
          <Button variant="secondary" size="sm" onClick={copyAll}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy content"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadTextFile(`biggbee-knowledge-base-${new Date().toISOString().slice(0, 10)}.txt`, kb.knowledgeBaseText)}
          >
            <Download className="h-3.5 w-3.5" /> Download TXT
          </Button>
        </div>
      </div>

      {filteredSections.length === 0 ? (
        <EmptyState icon={BookOpen} title="No sections match your search" description="Try a different keyword." />
      ) : (
        <div className="space-y-3">
          {filteredSections.map((section) => {
            const isCollapsed = collapsed.has(section.title);
            return (
              <Card key={section.title} className="overflow-hidden">
                <button
                  onClick={() => toggle(section.title)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left transition-colors hover:bg-panel"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-text-tertiary" /> : <ChevronDown className="h-4 w-4 text-text-tertiary" />}
                  <span className="text-sm font-semibold text-text-primary">{section.title}</span>
                  <span className="ml-auto text-[11px] text-text-tertiary">{section.content.length.toLocaleString()} chars</span>
                </button>
                {!isCollapsed && (
                  <CardContent className="border-t border-border-subtle pt-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                      {search ? highlight(section.content, search) : section.content}
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-strong">
        {part}
      </mark>
    ) : (
      part
    )
  );
}
