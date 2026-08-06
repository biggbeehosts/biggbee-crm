"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { UnknownSender, UnknownSenderClassification } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { Bell, Check, Copy, MailQuestion, Search, ShieldAlert, Trash2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { deleteSenderRecordAction, markReviewedAction, reclassifySenderAction } from "@/lib/actions/unknown-senders";

// Default queue is only what genuinely needs a decision -- everything else has already been
// resolved (Internal/System Notification/Lead Reply are all "we know what this is" states).
const DEFAULT_VISIBLE: UnknownSenderClassification[] = ["Needs Review", "Unknown"];

const CLASSIFICATION_BADGE: Record<UnknownSenderClassification, { label: string; variant: "outline" | "accent" | "default" | "warning" }> = {
  "Needs Review": { label: "Needs Review", variant: "warning" },
  Unknown: { label: "Unknown", variant: "default" },
  "Lead Reply": { label: "Lead Reply", variant: "accent" },
  Internal: { label: "Internal", variant: "outline" },
  "System Notification": { label: "System Notification", variant: "outline" },
};

export function UnknownSendersView({ senders }: { senders: UnknownSender[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [classificationFilter, setClassificationFilter] = React.useState<UnknownSenderClassification | "default" | "all">("default");
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  const keyOf = (s: UnknownSender) => `${s.fromEmail}-${s.timestamp ?? ""}`;

  const counts = React.useMemo(() => {
    const map = new Map<UnknownSenderClassification, number>();
    for (const s of senders) map.set(s.classification, (map.get(s.classification) ?? 0) + 1);
    return map;
  }, [senders]);

  const visible =
    classificationFilter === "all"
      ? senders
      : classificationFilter === "default"
        ? senders.filter((s) => DEFAULT_VISIBLE.includes(s.classification))
        : senders.filter((s) => s.classification === classificationFilter);
  const filtered = visible.filter((s) => {
    if (!search) return true;
    return `${s.fromEmail} ${s.subject} ${s.snippet}`.toLowerCase().includes(search.toLowerCase());
  });
  const resolvedCount = senders.length - senders.filter((s) => DEFAULT_VISIBLE.includes(s.classification)).length;

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

  function markSystemNotification(sender: UnknownSender) {
    return run(sender, () => reclassifySenderAction(sender.fromEmail, sender.timestamp, "System Notification"));
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
        <Select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value as typeof classificationFilter)}
          className="w-56"
          aria-label="Filter by classification"
        >
          <option value="default">Needs a look ({senders.filter((s) => DEFAULT_VISIBLE.includes(s.classification)).length})</option>
          <option value="all">All classifications ({senders.length})</option>
          {(Object.keys(CLASSIFICATION_BADGE) as UnknownSenderClassification[]).map((c) => (
            <option key={c} value={c}>
              {CLASSIFICATION_BADGE[c].label} ({counts.get(c) ?? 0})
            </option>
          ))}
        </Select>
        <p className="text-xs text-text-tertiary">
          {filtered.length} shown{classificationFilter === "default" && resolvedCount > 0 ? ` · ${resolvedCount} already resolved (hidden)` : ""}
        </p>
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
                      <Badge variant={CLASSIFICATION_BADGE[sender.classification].variant}>
                        {CLASSIFICATION_BADGE[sender.classification].label}
                      </Badge>
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
                    {sender.classification !== "System Notification" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markSystemNotification(sender)}
                        disabled={pending}
                        title="Mark as an automated platform notification, not a prospect"
                      >
                        <Bell className="h-3.5 w-3.5" /> Notification
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
