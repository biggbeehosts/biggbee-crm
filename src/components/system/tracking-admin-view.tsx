"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalyticsEvent, Campaign, Lead } from "@/types";
import type { AuditEntry } from "@/lib/audit/log";
import type { TrackingSettings } from "@/lib/data/tracking-settings-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { ShieldAlert, X, Trash2, Ban, Activity } from "lucide-react";
import {
  addInternalSenderAction,
  removeInternalSenderAction,
  updateRetentionDaysAction,
  purgeOldTrackingEventsAction,
  markEventsAsTestAction,
  deleteTestEventsForMonthAction,
} from "@/lib/actions/analytics";

export function TrackingAdminView({
  campaigns,
  recentEvents,
  settings,
  allowlist,
  suppressedLeads,
  auditLog,
}: {
  campaigns: Campaign[];
  recentEvents: AnalyticsEvent[];
  settings: TrackingSettings;
  allowlist: string[];
  suppressedLeads: Lead[];
  auditLog: AuditEntry[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [newSender, setNewSender] = React.useState("");

  const botEvents = recentEvents.filter((e) => e.isBotOrScanner);
  const testEvents = recentEvents.filter((e) => e.isTestEvent);
  const trackingHits = recentEvents.filter((e) => e.type === "open" || e.type === "click");
  const flaggedFirst = [...recentEvents]
    .sort((a, b) => Number(b.isBotOrScanner || b.isTestEvent) - Number(a.isBotOrScanner || a.isTestEvent))
    .slice(0, 100);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markSelectedAsTest() {
    const events = recentEvents.filter((e) => selected.has(e.id)).map((e) => ({ id: e.id, timestamp: e.timestamp }));
    if (events.length === 0) return;
    setPending(true);
    await markEventsAsTestAction(events);
    setSelected(new Set());
    router.refresh();
    setPending(false);
  }

  async function deleteTestForMonth(monthHint: string) {
    if (!window.confirm(`Delete all test events in ${monthHint}? This cannot be undone.`)) return;
    setPending(true);
    await deleteTestEventsForMonthAction(monthHint);
    router.refresh();
    setPending(false);
  }

  async function addSender(e: React.FormEvent) {
    e.preventDefault();
    if (!newSender.trim()) return;
    setPending(true);
    const formData = new FormData();
    formData.set("entry", newSender.trim());
    await addInternalSenderAction(formData);
    setNewSender("");
    router.refresh();
    setPending(false);
  }

  async function removeSender(entry: string) {
    setPending(true);
    await removeInternalSenderAction(entry);
    router.refresh();
    setPending(false);
  }

  async function updateRetention(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    await updateRetentionDaysAction(new FormData(e.currentTarget));
    router.refresh();
    setPending(false);
  }

  async function purgeOld() {
    if (!window.confirm(`Purge all tracking events older than ${settings.retentionDays} days? This cannot be undone.`)) return;
    setPending(true);
    await purgeOldTrackingEventsAction();
    router.refresh();
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tracking Hits (30d)" value={trackingHits.length} icon={Activity} hint="Open + click events, last 30 days" />
        <StatCard label="Suspected Bot/Scanner Hits" value={botEvents.length} icon={ShieldAlert} tone={botEvents.length ? "warning" : "default"} />
        <StatCard label="Test Events (30d)" value={testEvents.length} icon={Trash2} />
        <StatCard label="Suppressed Leads" value={suppressedLeads.length} icon={Ban} tone={suppressedLeads.length ? "danger" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Campaign Tracking Toggles</CardTitle>
            <CardDescription>Open/click/reply tracking and deliverability testing are configured per campaign — edit a campaign to change them</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border-subtle">
          {campaigns.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href="/campaigns" className="text-sm font-medium text-text-primary hover:text-accent">
                {c.name}
              </Link>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={c.openTrackingEnabled ? "accent" : "outline"}>Open {c.openTrackingEnabled ? "on" : "off"}</Badge>
                <Badge variant={c.clickTrackingEnabled ? "accent" : "outline"}>Click {c.clickTrackingEnabled ? "on" : "off"}</Badge>
                <Badge variant={c.replyTrackingEnabled ? "accent" : "outline"}>Reply {c.replyTrackingEnabled ? "on" : "off"}</Badge>
                <Badge variant={c.deliverabilityTestEnabled ? "accent" : "outline"}>Deliverability {c.deliverabilityTestEnabled ? "on" : "off"}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Internal Sender Allowlist</CardTitle>
              <CardDescription>Emails/@domains that must never be treated as prospect replies or Unknown Senders</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={addSender} className="mb-3 flex gap-2">
              <Input value={newSender} onChange={(e) => setNewSender(e.target.value)} placeholder="office@biggbees.com or @biggbees.com" />
              <Button type="submit" disabled={pending}>
                Add
              </Button>
            </form>
            <div className="space-y-1.5">
              {allowlist.map((entry) => (
                <div key={entry} className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-1.5 text-sm">
                  <span className="text-text-primary">{entry}</span>
                  <button onClick={() => removeSender(entry)} disabled={pending} className="text-text-tertiary hover:text-danger" aria-label="Remove">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Retention Settings</CardTitle>
              <CardDescription>Tracking events older than this are eligible for purge (manual, not automatic)</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={updateRetention} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium text-text-tertiary">Retention (days)</label>
                <Input type="number" name="retentionDays" min={30} max={3650} defaultValue={settings.retentionDays} />
              </div>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </form>
            <Button variant="outline" onClick={purgeOld} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5" /> Purge events older than {settings.retentionDays} days now
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Suppressed Leads</CardTitle>
            <CardDescription>Bounced/unsubscribed/complained — future outreach is blocked and never automatically reversed</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {suppressedLeads.length === 0 ? (
            <EmptyState icon={Ban} title="No suppressed leads" description="Hard bounces, complaints, and unsubscribes will appear here." />
          ) : (
            <div className="divide-y divide-border-subtle">
              {suppressedLeads.map((l) => (
                <div key={l.email} className="flex items-center justify-between py-2">
                  <Link href={`/leads/${encodeURIComponent(l.email)}`} className="text-sm font-medium text-text-primary hover:text-accent">
                    {l.company || l.email}
                  </Link>
                  <Badge variant="danger">{l.suppressedReason}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Inspect Tracking Events (last 30 days)</CardTitle>
            <CardDescription>Bot/scanner and test-flagged events shown first — select rows to mark as test</CardDescription>
          </div>
          <Button size="sm" onClick={markSelectedAsTest} disabled={pending || selected.size === 0}>
            Mark {selected.size || ""} selected as test
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {flaggedFirst.length === 0 ? (
            <EmptyState icon={Activity} title="No tracking events yet" description="Opens, clicks, replies, and bounces will appear here." />
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-text-tertiary">
                <tr>
                  <th className="w-8 py-2"></th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Time</th>
                  <th className="py-2 font-medium">Lead</th>
                  <th className="py-2 font-medium">Flags</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {flaggedFirst.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5">
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelected(e.id)} />
                    </td>
                    <td className="py-1.5 text-text-primary">{e.type}</td>
                    <td className="py-1.5 text-text-tertiary">{formatDateTime(e.timestamp)}</td>
                    <td className="py-1.5 text-text-secondary">{e.leadId ?? "—"}</td>
                    <td className="py-1.5">
                      <div className="flex gap-1">
                        {e.isBotOrScanner && <Badge variant="warning">bot</Badge>}
                        {e.isTestEvent && <Badge variant="outline">test</Badge>}
                      </div>
                    </td>
                    <td className="py-1.5 text-text-tertiary">{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {testEvents.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Delete Test Events</CardTitle>
              <CardDescription>Clears every test-flagged event for a given month</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Array.from(new Set(testEvents.map((e) => e.timestamp.slice(0, 7)))).map((month) => (
              <Button key={month} variant="outline" size="sm" onClick={() => deleteTestForMonth(`analytics-events-${month}`)} disabled={pending}>
                <Trash2 className="h-3.5 w-3.5" /> Delete test events — {month}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tracking Settings Audit Log</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border-subtle">
          {auditLog.length === 0 ? (
            <p className="py-2 text-sm text-text-tertiary">No tracking-setting changes recorded yet.</p>
          ) : (
            auditLog.slice(0, 30).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-1.5 text-xs">
                <span className="text-text-secondary">
                  {a.action} {a.target ? `— ${a.target}` : ""}
                </span>
                <span className="text-text-tertiary">
                  {a.actor} · {formatDateTime(a.timestamp)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
