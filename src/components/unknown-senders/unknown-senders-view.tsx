"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { UnknownSender } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { Check, Copy, MailQuestion, Search, ShieldAlert, Trash2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { deleteSenderRecordAction, markReviewedAction, reclassifySenderAction } from "@/lib/actions/unknown-senders";

export function UnknownSendersView({ senders }: { senders: UnknownSender[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [showInternal, setShowInternal] = React.useState(false);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  const keyOf = (s: UnknownSender) => `${s.fromEmail}-${s.timestamp ?? ""}`;

  const visible = senders.filter((s) => showInternal || s.classification !== "Internal");
  const filtered = visible.filter((s) => {
    if (!search) return true;
    return `${s.fromEmail} ${s.subject} ${s.snippet}`.toLowerCase().includes(search.toLowerCase());
  });
  const internalCount = senders.length - visible.length;

  async function copyEmail(email: string) {
    await navigator.clipboard.writeText(email);
  }

  async function run(sender: UnknownSender, fn: () => Promise<{ success: boolean; message: string }>) {
    setPendingKey(keyOf(sender));
    const result = await fn();
    if (!result.success) window.alert(result.message);
    router.refresh();
    setPendingKey(null);
  }

  function toggleReviewed(sender: UnknownSender) {
    return run(sender, () => markReviewedAction(sender.fromEmail, sender.timestamp, !sender.reviewed));
  }

  function markInternal(sender: UnknownSender) {
    return run(sender, () => reclassifySenderAction(sender.fromEmail, sender.timestamp, "Internal"));
  }

  function markLeadReply(sender: UnknownSender) {
    return run(sender, () => reclassifySenderAction(sender.fromEmail, sender.timestamp, "Lead Reply"));
  }

  function remove(sender: UnknownSender) {
    if (!window.confirm(`Delete this record from ${sender.fromEmail}? This cannot be undone.`)) return;
    return run(sender, () => deleteSenderRecordAction(sender.fromEmail, sender.timestamp));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search unmatched replies…" className="pl-8" />
        </div>
        <p className="text-xs text-text-tertiary">
          {filtered.length} of {visible.length}
          {internalCount > 0 && !showInternal ? ` · ${internalCount} internal hidden` : ""}
        </p>
        {internalCount > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowInternal((v) => !v)}>
            {showInternal ? "Hide internal" : `Show internal (${internalCount})`}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={MailQuestion}
            title={senders.length === 0 ? "No unmatched replies" : "Nothing matches"}
            description={senders.length === 0 ? "Replies that can't be matched to a lead will appear here." : undefined}
            className="m-5"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((sender) => {
              const key = keyOf(sender);
              const pending = pendingKey === key;
              return (
                <li key={key} className={cn("flex items-start gap-3 px-4 py-3", sender.reviewed && "opacity-55")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">{sender.fromEmail}</p>
                      {sender.classification === "Internal" && <Badge variant="outline">Internal</Badge>}
                      {sender.classification === "Lead Reply" && <Badge variant="accent">Lead Reply</Badge>}
                      {sender.reviewed && <Badge variant="success">Reviewed</Badge>}
                      <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{formatDateTime(sender.timestamp)}</span>
                    </div>
                    {sender.subject && <p className="mt-0.5 text-xs text-text-secondary">{sender.subject}</p>}
                    {sender.snippet && <p className="mt-0.5 text-xs text-text-tertiary">{sender.snippet}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => copyEmail(sender.fromEmail)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleReviewed(sender)} disabled={pending}>
                      <Check className="h-3.5 w-3.5" />
                      {sender.reviewed ? "Unmark" : "Mark reviewed"}
                    </Button>
                    {sender.classification !== "Lead Reply" && (
                      <Button size="sm" variant="ghost" onClick={() => markLeadReply(sender)} disabled={pending} title="Reclassify as a genuine lead reply">
                        <UserCheck className="h-3.5 w-3.5" /> Lead reply
                      </Button>
                    )}
                    {sender.classification !== "Internal" && (
                      <Button size="sm" variant="ghost" onClick={() => markInternal(sender)} disabled={pending} title="Mark as internal / not a prospect">
                        <ShieldAlert className="h-3.5 w-3.5" /> Internal
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => remove(sender)} disabled={pending}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
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
