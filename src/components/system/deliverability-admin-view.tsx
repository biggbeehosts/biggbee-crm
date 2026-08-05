"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Campaign, InboxPlacementTest, SeedRecipient } from "@/types";
import { INBOX_PLACEMENT_RESULTS } from "@/types";
import type { DeliverabilitySummary, ProviderBreakdown } from "@/lib/calculations/deliverability-metrics";
import { NOT_CONNECTED_MESSAGE } from "@/lib/deliverability/provider-adapter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { Inbox, PlugZap, Trash2, X } from "lucide-react";
import {
  recordManualPlacementResultAction,
  deletePlacementResultAction,
  addSeedRecipientAction,
  removeSeedRecipientAction,
} from "@/lib/actions/deliverability";

const RESULT_TONE: Record<string, "success" | "warning" | "danger" | "outline"> = {
  Inbox: "success",
  Promotions: "warning",
  Spam: "danger",
  Missing: "outline",
  NotTested: "outline",
  Unknown: "outline",
};

export function DeliverabilityAdminView({
  campaigns,
  tests,
  seeds,
  summary,
  byProvider,
}: {
  campaigns: Campaign[];
  tests: InboxPlacementTest[];
  seeds: SeedRecipient[];
  summary: DeliverabilitySummary;
  byProvider: ProviderBreakdown[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function submitPlacement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    await recordManualPlacementResultAction(new FormData(e.currentTarget));
    e.currentTarget.reset();
    router.refresh();
    setPending(false);
  }

  async function deleteTest(id: string) {
    setPending(true);
    await deletePlacementResultAction(id);
    router.refresh();
    setPending(false);
  }

  async function submitSeed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    await addSeedRecipientAction(new FormData(e.currentTarget));
    e.currentTarget.reset();
    router.refresh();
    setPending(false);
  }

  async function removeSeed(id: string) {
    setPending(true);
    await removeSeedRecipientAction(id);
    router.refresh();
    setPending(false);
  }

  return (
    <div className="space-y-6">
      {tests.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/10 p-3.5 text-sm text-warning">
          <PlugZap className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{NOT_CONNECTED_MESSAGE}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Inbox Placement Tests" value={summary.totalTests} icon={Inbox} />
        <StatCard label="Inbox Count" value={summary.inboxCount} icon={Inbox} tone="success" />
        <StatCard label="Spam Count" value={summary.spamCount} icon={Inbox} tone={summary.spamCount ? "danger" : "default"} />
        <StatCard
          label="Inbox Placement Rate"
          value={summary.inboxPlacementRate === null ? "Not tested" : `${Math.round(summary.inboxPlacementRate * 100)}%`}
          icon={Inbox}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Record a Placement Result</CardTitle>
              <CardDescription>Manual entry — the only way a result is recorded until a real provider is connected</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPlacement} className="space-y-2.5">
              <Select name="campaignId" required defaultValue="">
                <option value="" disabled>
                  Select campaign
                </option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input name="subject" placeholder="Subject line tested" required />
              <Input name="sender" placeholder="Sender address" required />
              <Input name="seedRecipient" type="email" placeholder="Seed recipient email" required />
              <Input name="mailboxProvider" placeholder="Mailbox provider (Gmail, Outlook, Yahoo, ...)" required />
              <Select name="placementResult" required defaultValue="">
                <option value="" disabled>
                  Placement result
                </option>
                {INBOX_PLACEMENT_RESULTS.filter((r) => r !== "NotTested").map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Input name="notes" placeholder="Notes (optional)" />
              <Button type="submit" disabled={pending}>
                Record result
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Seed Recipients</CardTitle>
              <CardDescription>Admin-controlled inboxes used for placement tests — never real prospects</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitSeed} className="mb-3 flex flex-wrap gap-2">
              <Input name="email" type="email" placeholder="seed@gmail.com" required className="flex-1 min-w-[160px]" />
              <Input name="mailboxProvider" placeholder="Provider" required className="w-32" />
              <Input name="label" placeholder="Label (optional)" className="w-32" />
              <Button type="submit" disabled={pending}>
                Add
              </Button>
            </form>
            {seeds.length === 0 ? (
              <p className="text-xs text-text-tertiary">No seed recipients configured yet.</p>
            ) : (
              <div className="space-y-1.5">
                {seeds.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-1.5 text-sm">
                    <span className="text-text-primary">
                      {s.email} <span className="text-text-tertiary">· {s.mailboxProvider}</span>
                    </span>
                    <button onClick={() => removeSeed(s.id)} disabled={pending} className="text-text-tertiary hover:text-danger" aria-label="Remove">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Results by Mailbox Provider</CardTitle>
        </CardHeader>
        <CardContent>
          {byProvider.length === 0 ? (
            <EmptyState icon={Inbox} title="No placement tests recorded" description={NOT_CONNECTED_MESSAGE} />
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-text-tertiary">
                <tr>
                  <th className="py-2 font-medium">Provider</th>
                  <th className="py-2 font-medium">Inbox</th>
                  <th className="py-2 font-medium">Promotions</th>
                  <th className="py-2 font-medium">Spam</th>
                  <th className="py-2 font-medium">Missing</th>
                  <th className="py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {byProvider.map((p) => (
                  <tr key={p.provider}>
                    <td className="py-1.5 text-text-primary">{p.provider}</td>
                    <td className="py-1.5 text-success">{p.inbox}</td>
                    <td className="py-1.5 text-warning">{p.promotions}</td>
                    <td className="py-1.5 text-danger">{p.spam}</td>
                    <td className="py-1.5 text-text-tertiary">{p.missing}</td>
                    <td className="py-1.5 text-text-secondary">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Placement Tests</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border-subtle">
          {tests.length === 0 ? (
            <p className="py-2 text-sm text-text-tertiary">No tests recorded yet.</p>
          ) : (
            tests.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm text-text-primary">
                    {campaigns.find((c) => c.id === t.campaignId)?.name ?? t.campaignId} · {t.mailboxProvider}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {t.seedRecipient} · {formatDateTime(t.testedAt)} · {t.recordedBy}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={RESULT_TONE[t.placementResult] ?? "outline"}>{t.placementResult}</Badge>
                  <button onClick={() => deleteTest(t.id)} disabled={pending} className="text-text-tertiary hover:text-danger" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
