"use client";

import * as React from "react";
import type { UnknownSender } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { Check, Copy, MailQuestion, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function UnknownSendersView({ senders }: { senders: UnknownSender[] }) {
  const [search, setSearch] = React.useState("");
  const [copied, setCopied] = React.useState<string | null>(null);
  // Session-local: the Unknown_Senders sheet has no Reviewed column, so this resets on reload.
  const [reviewed, setReviewed] = React.useState<Set<string>>(new Set());

  const filtered = senders.filter((s) => {
    if (!search) return true;
    return `${s.fromEmail} ${s.subject} ${s.snippet}`.toLowerCase().includes(search.toLowerCase());
  });

  async function copyEmail(email: string) {
    await navigator.clipboard.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 1500);
  }

  function toggleReviewed(key: string) {
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search unmatched replies…" className="pl-8" />
        </div>
        <p className="text-xs text-text-tertiary">
          {filtered.length} of {senders.length} · &quot;Reviewed&quot; is session-only until the sheet gets a Reviewed column
        </p>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={MailQuestion}
            title={senders.length === 0 ? "No unmatched replies" : "Nothing matches your search"}
            description={senders.length === 0 ? "Replies that can't be matched to a lead will appear here." : undefined}
            className="m-5"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((sender, i) => {
              const key = `${sender.fromEmail}-${sender.timestamp ?? i}`;
              const isReviewed = reviewed.has(key);
              return (
                <li key={key} className={cn("flex items-start gap-3 px-4 py-3", isReviewed && "opacity-55")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">{sender.fromEmail}</p>
                      {isReviewed && <Badge variant="success">Reviewed</Badge>}
                      <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{formatDateTime(sender.timestamp)}</span>
                    </div>
                    {sender.subject && <p className="mt-0.5 text-xs text-text-secondary">{sender.subject}</p>}
                    {sender.snippet && <p className="mt-0.5 text-xs text-text-tertiary">{sender.snippet}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => copyEmail(sender.fromEmail)}>
                      {copied === sender.fromEmail ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === sender.fromEmail ? "Copied" : "Copy email"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleReviewed(key)}>
                      <Check className="h-3.5 w-3.5" />
                      {isReviewed ? "Unmark" : "Mark reviewed"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
