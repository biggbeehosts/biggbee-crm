"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Mail, Pause, Play, RefreshCw, ScanSearch, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils/date";
import { LIVE_CONFIRM_PHRASE } from "@/lib/redesign/core.mjs";
import type { PublicRedesignCampaign } from "@/lib/redesign/store";
import type { RedesignScanResult } from "@/lib/redesign/service";
import {
  createRedesignCampaignAction,
  markRedesignRunStoppedAction,
  pauseRedesignRunAction,
  resumeRedesignRunAction,
  scanRedesignAction,
  startRedesignDryRunAction,
  startRedesignLiveRunAction,
} from "@/lib/redesign/actions";

interface Described {
  workspaceConfigured: boolean;
  items: { key: string; label: string; envVar: string; configured: boolean; hint: string }[];
  ready: boolean;
  liveReady: boolean;
  liveBlockers: string[];
}

interface Limits {
  delaySeconds: number;
  hourlyLimit: number;
  dailyLimit: number;
  maxScreenshots: number;
  maxPerRun: number;
}

const STATUS_VARIANT = { draft: "outline", running: "lime", pausing: "warning", paused: "warning", completed: "success", failed: "danger", cancelled: "outline" } as const;
const RESULT_VARIANT = { previewed: "info", blocked: "warning", queued: "outline", sending: "accent", sent: "success", failed: "danger", skipped: "outline" } as const;

export function RedesignView({ described, limits, campaigns }: { described: Described; limits: Limits | null; campaigns: PublicRedesignCampaign[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string>(campaigns[0]?.id ?? "");
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [scan, setScan] = React.useState<RedesignScanResult | null>(null);
  const [confirmLive, setConfirmLive] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [openPreview, setOpenPreview] = React.useState<string | null>(null);

  const campaign = campaigns.find((c) => c.id === selectedId) ?? campaigns[0] ?? null;
  const active = campaign?.status === "running" || campaign?.status === "pausing";

  // Poll for progress while a run is active (server state only; nothing sensitive in it).
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [active, router]);

  async function run(label: string, fn: () => Promise<{ success: boolean; message: string }>) {
    setBusy(label);
    try {
      const res = await fn();
      toast(res.message, res.success ? "success" : "error");
      router.refresh();
      return res;
    } finally {
      setBusy(null);
    }
  }

  async function doScan() {
    setBusy("scan");
    try {
      const res = await scanRedesignAction(campaign?.id);
      toast(res.message, res.success ? "success" : "error");
      if (res.scan) setScan(res.scan);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!described.workspaceConfigured) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Not set up for this workspace"
        description="Website Redesign Outreach has its own sheet, Drive folder and workflow, and none are configured for the workspace you're viewing. Switch workspace, or ask an administrator to configure it."
      />
    );
  }

  const dryResults = campaign ? Object.values(campaign.dry) : [];
  const liveResults = campaign ? Object.values(campaign.live) : [];
  const previews = dryResults.filter((r) => r.status === "previewed");
  const mode = campaign?.currentMode ?? "dry";
  const shown = mode === "live" ? liveResults : dryResults;
  const processed = shown.length;
  const toProcess = campaign?.plan?.toProcess ?? 0;
  const pct = toProcess > 0 ? Math.round((processed / toProcess) * 100) : 0;
  const count = (list: typeof shown, s: string) => list.filter((r) => r.status === s).length;
  const lastBeat = campaign?.heartbeatAt ?? campaign?.runRequestedAt;
  const stale = campaign?.stale === true;
  const canPause = campaign?.status === "running";
  const canResume = campaign?.status === "paused" || campaign?.status === "failed";
  const liveReadyForCampaign = described.liveReady && !!campaign?.dryRunCompletedAt && previews.length > 0;

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Configuration</p>
            <Badge variant={described.ready ? "lime" : "warning"}>{described.ready ? "Complete" : "Incomplete"}</Badge>
          </div>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {described.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 rounded-lg border border-border-subtle bg-panel p-2.5">
                {i.configured ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{i.label}</p>
                  <p className="text-[11px] text-text-tertiary">{i.configured ? "Set" : `Not set -- enter ${i.envVar} on the server. ${i.hint}`}</p>
                </div>
              </li>
            ))}
          </ul>
          {limits && (
            <p className="text-[11px] text-text-tertiary">
              Pacing: {limits.delaySeconds}s between sends, up to {limits.hourlyLimit || "?"}/hour and {limits.dailyLimit || "?"}/day (never above your provider&apos;s verified limits), {limits.maxPerRun} per run, up to {limits.maxScreenshots} screenshots per email. Pacing is not a spam-protection guarantee.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Campaign */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm font-semibold text-text-primary">Campaign</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={campaign?.id ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setScan(null);
              }}
              className="h-9 rounded-lg border border-border-subtle bg-surface-raised px-3 text-sm text-text-primary sm:w-72"
              aria-label="Select campaign"
              disabled={campaigns.length === 0}
            >
              {campaigns.length === 0 && <option value="">No campaigns yet</option>}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
            <div className="flex flex-1 gap-2">
              <Input placeholder="New campaign name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
              <Button
                variant="secondary"
                disabled={busy !== null || newName.trim().length < 2 || !described.ready}
                onClick={async () => {
                  const res = await run("create", () => createRedesignCampaignAction(newName));
                  if (res?.success) setNewName("");
                }}
              >
                Create
              </Button>
            </div>
          </div>

          {campaign && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
                {campaign.currentMode && <Badge variant={campaign.currentMode === "live" ? "danger" : "info"}>{campaign.currentMode === "live" ? "LIVE" : "Dry run"}</Badge>}
                {campaign.pauseReason && <span className="text-xs text-warning">{campaign.pauseReason}</span>}
                {campaign.lastError && <span className="text-xs text-danger">{campaign.lastError}</span>}
                {lastBeat && <span className="text-[11px] text-text-tertiary">Last activity {formatDateTime(lastBeat)}</span>}
              </div>
              {(active || processed > 0) && (
                <div className="space-y-1.5">
                  <Progress value={pct} />
                  <p className="text-xs text-text-secondary">
                    {processed}/{toProcess || "?"} processed -- {count(shown, "sent")} sent, {count(shown, "previewed")} previewed, {count(shown, "blocked")} blocked, {count(shown, "failed")} failed
                  </p>
                </div>
              )}
              {stale && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
                  The workflow hasn&apos;t reported in for over 10 minutes.
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("stop", () => markRedesignRunStoppedAction(campaign.id))}>
                    Mark as stopped
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connections & matching */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Connections &amp; screenshot matching</p>
            <Button size="sm" variant="secondary" disabled={busy !== null || !described.ready} onClick={doScan}>
              {busy === "scan" ? <RefreshCw className="animate-spin" /> : <ScanSearch />} Check connections &amp; scan
            </Button>
          </div>
          {!scan && campaign?.lastScan && (
            <p className="text-xs text-text-secondary">
              Last scan {formatDateTime(campaign.lastScan.at)}: {campaign.lastScan.discovered} discovered, {campaign.lastScan.eligible} eligible, {campaign.lastScan.matched} matched to a folder, {campaign.lastScan.blocked} blocked.
            </p>
          )}
          {!scan && !campaign?.lastScan && <p className="text-xs text-text-tertiary">Nothing is read until you press the button. The scan is read-only.</p>}
          {scan && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-border-subtle bg-panel p-2.5 text-xs">
                  <Badge variant={scan.sheet.ok ? "lime" : "danger"}>{scan.sheet.ok ? "Sheet connected" : "Sheet problem"}</Badge>
                  <p className="mt-1 text-text-secondary">{scan.sheet.message}</p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-panel p-2.5 text-xs">
                  <Badge variant={scan.drive.ok ? "lime" : "danger"}>{scan.drive.ok ? "Drive connected" : "Drive problem"}</Badge>
                  <p className="mt-1 text-text-secondary">{scan.drive.message}</p>
                </div>
              </div>
              {scan.serviceAccount === "shared" && (
                <p className="text-[11px] text-text-tertiary">This preview reads with the CRM&apos;s existing service account (read-only). Share the redesign sheet and Drive folder with it to scan, or set a dedicated one.</p>
              )}
              {scan.mappingProblems.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning">
                  {scan.mappingProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {scan.foldersTruncated && <p className="text-xs text-warning">The Drive folder has more than 1000 subfolders; only the first 1000 were read, so matching is incomplete.</p>}
              {scan.summary && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Discovered", scan.summary.discovered],
                      ["Eligible", scan.summary.eligible],
                      ["Folder matched", scan.summary.matched],
                      ["Blocked", scan.summary.blocked],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-border-subtle bg-panel p-2.5">
                        <p className="text-[11px] text-text-tertiary">{label}</p>
                        <p className="text-lg font-semibold text-text-primary">{value}</p>
                      </div>
                    ))}
                  </div>
                  {scan.screenshotChecksSkipped > 0 && <p className="text-[11px] text-text-tertiary">Screenshots were checked for the first 25 matched businesses; {scan.screenshotChecksSkipped} more are checked when the run executes.</p>}
                  <div className="overflow-x-auto rounded-lg border border-border-subtle">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-panel text-text-tertiary">
                        <tr>
                          <th className="px-3 py-2">Business</th>
                          <th className="px-3 py-2">Eligibility</th>
                          <th className="px-3 py-2">Drive folder</th>
                          <th className="px-3 py-2">Screenshots</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scan.rows.map((r, i) => (
                          <tr key={`${r.email}-${i}`} className="border-t border-border-subtle align-top">
                            <td className="px-3 py-2">
                              <p className="font-medium text-text-primary">{r.businessName}</p>
                              <p className="text-text-tertiary">{r.email}</p>
                            </td>
                            <td className="px-3 py-2">{r.eligible ? <Badge variant="success">Eligible</Badge> : <span className="text-warning">{r.reasons.join(" ")}</span>}</td>
                            <td className="px-3 py-2">{r.folder.status === "matched" ? <Badge variant="lime">{r.folder.name}</Badge> : <span className="text-warning">{r.folder.status.replace("_", " ")}{r.folder.reason ? ` -- ${r.folder.reason}` : ""}</span>}</td>
                            <td className="px-3 py-2">{!r.screenshots.checked ? <span className="text-text-tertiary">--</span> : r.screenshots.ok ? <Badge variant="success">{r.screenshots.count} ready</Badge> : <span className="text-danger">{r.screenshots.reason}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run controls */}
      {campaign && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <p className="text-sm font-semibold text-text-primary">Run</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy !== null || active || !described.ready} onClick={() => run("dry", () => startRedesignDryRunAction(campaign.id))}>
                <Play /> Start dry run (no emails sent)
              </Button>
              <Button variant="outline" disabled={busy !== null || !canPause} onClick={() => run("pause", () => pauseRedesignRunAction(campaign.id))}>
                <Pause /> Pause
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-danger/25 bg-danger/5 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-danger">
                <Mail className="h-4 w-4" /> Live sending
              </p>
              <p className="text-xs text-text-secondary">
                Sends only the emails you previewed in a completed dry run, one at a time, from the workspace&apos;s own mailbox.
                {campaign.dryRunCompletedAt ? ` Dry run completed ${formatDateTime(campaign.dryRunCompletedAt)}.` : " No completed dry run yet."}
              </p>
              {!described.liveReady && <p className="text-xs text-warning">{described.liveBlockers.join(" ")}</p>}
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <Checkbox checked={confirmLive} onCheckedChange={(v) => setConfirmLive(v === true)} />I have reviewed the previews and want to send real emails.
              </label>
              <Input placeholder={`Type ${LIVE_CONFIRM_PHRASE} to confirm`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="max-w-xs" />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  disabled={busy !== null || active || !liveReadyForCampaign || !confirmLive || confirmText.trim() !== LIVE_CONFIRM_PHRASE}
                  onClick={() => run("live", () => startRedesignLiveRunAction(campaign.id, confirmLive, confirmText))}
                >
                  Start live run
                </Button>
                <Button
                  variant="outline"
                  disabled={busy !== null || !canResume || (campaign.currentMode === "live" && (!confirmLive || confirmText.trim() !== LIVE_CONFIRM_PHRASE))}
                  onClick={() => run("resume", () => resumeRedesignRunAction(campaign.id, confirmLive, confirmText))}
                >
                  <Play /> Resume
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email previews */}
      {campaign && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold text-text-primary">Email previews ({previews.length})</p>
            {previews.length === 0 ? (
              <p className="text-xs text-text-tertiary">Run a dry run to generate previews. Nothing is sent in a dry run.</p>
            ) : (
              <ul className="space-y-2">
                {previews.map((p) => (
                  <li key={p.businessKey} className="rounded-lg border border-border-subtle bg-panel p-3">
                    <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpenPreview(openPreview === p.businessKey ? null : p.businessKey)}>
                      <span>
                        <span className="block text-[13px] font-medium text-text-primary">{p.subject}</span>
                        <span className="block text-[11px] text-text-tertiary">
                          To {p.businessName} &lt;{p.email}&gt; -- {p.attachmentNames?.length ?? 0} screenshot(s) attached
                        </span>
                      </span>
                      {p.usedFallback && <Badge variant="warning">Safe wording used</Badge>}
                    </button>
                    {openPreview === p.businessKey && (
                      <div className="mt-2 space-y-1.5 border-t border-border-subtle pt-2">
                        <pre className="whitespace-pre-wrap font-sans text-xs text-text-secondary">{p.bodyText}</pre>
                        <p className="text-[11px] text-text-tertiary">Attachments: {(p.attachmentNames ?? []).join(", ") || "none"}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {campaign && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold text-text-primary">Results</p>
            {[...dryResults.filter((r) => r.status !== "previewed"), ...liveResults].length === 0 ? (
              <p className="text-xs text-text-tertiary">No send results or blocked businesses yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-left text-xs">
                  <thead className="bg-panel text-text-tertiary">
                    <tr>
                      <th className="px-3 py-2">Business</th>
                      <th className="px-3 py-2">Run</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dryResults.filter((r) => r.status !== "previewed").map((r) => ({ r, run: "dry" })), ...liveResults.map((r) => ({ r, run: "live" }))].map(({ r, run: runMode }) => (
                      <tr key={`${runMode}-${r.businessKey}`} className="border-t border-border-subtle align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium text-text-primary">{r.businessName}</p>
                          <p className="text-text-tertiary">{r.email}</p>
                        </td>
                        <td className="px-3 py-2">{runMode}</td>
                        <td className="px-3 py-2">
                          <Badge variant={RESULT_VARIANT[r.status]}>{r.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{r.reason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
