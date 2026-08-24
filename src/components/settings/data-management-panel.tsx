"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  cleanTestDataAction,
  getTestDataPreviewAction,
  resetCrmDataAction,
  type CleanTestDataResult,
  type ResetCrmDataResult,
  type TestDataPreview,
} from "@/lib/actions/data-management";

function Row({ label, count, canDelete, reason }: { label: string; count: number; canDelete: boolean; reason?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        {!canDelete && reason && <p className="text-[11px] text-text-tertiary">{reason}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={count > 0 ? "purple" : "outline"}>{count}</Badge>
        {!canDelete && <Badge variant="outline">Preview only</Badge>}
      </div>
    </div>
  );
}

function CleanTestDataDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<TestDataPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<CleanTestDataResult | null>(null);

  async function handleOpen(next: boolean) {
    setOpen(next);
    setResult(null);
    setConfirmText("");
    if (next) {
      setLoading(true);
      setPreview(await getTestDataPreviewAction());
      setLoading(false);
    }
  }

  async function execute() {
    setPending(true);
    const res = await cleanTestDataAction(confirmText);
    setResult(res);
    setPending(false);
    if (res.success) router.refresh();
  }

  const totalDeletable = preview
    ? preview.leads.count + preview.campaigns.count + preview.unknownSenders.count + preview.trackingEvents.count
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Trash2 className="h-3.5 w-3.5" /> Clean Test Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clean Test Data</DialogTitle>
          <DialogDescription>Deletes only records already tagged as test data. Production records are never touched.</DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <p className="py-6 text-center text-sm text-text-tertiary">Counting test records…</p>
        ) : result ? (
          <div className="space-y-2">
            <p className={result.success ? "text-sm text-success" : "text-sm text-danger"}>{result.message}</p>
            <div className="space-y-1.5">
              {Object.entries(result.results).map(([store, r]) => (
                <div key={store} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{store}</span>
                  <span className="text-text-tertiary">
                    {r.deleted} deleted{r.failed > 0 ? `, ${r.failed} failed` : ""}
                  </span>
                </div>
              ))}
            </div>
            {result.skipped.length > 0 && (
              <p className="text-[11px] text-text-tertiary">Not cleaned (see reasons above): {result.skipped.map((s) => s.store).join(", ")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Row label="Test Leads" count={preview.leads.count} canDelete />
              <Row label="Test Campaigns" count={preview.campaigns.count} canDelete />
              <Row label="Test Unknown Senders" count={preview.unknownSenders.count} canDelete />
              <Row label="Test Tracking Events" count={preview.trackingEvents.count} canDelete />
              <Row label="Test Lead Memory" count={preview.leadMemory.count} canDelete={false} reason={preview.leadMemory.reason} />
              <Row label="Test Errors" count={preview.errors.count} canDelete={false} reason={preview.errors.reason} />
            </div>
            {totalDeletable === 0 ? (
              <p className="rounded-lg border border-border-subtle bg-panel p-3 text-xs text-text-tertiary">No test data found -- nothing to clean.</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="clean-confirm">
                  Type <span className="font-mono font-semibold text-danger">DELETE TEST DATA</span> to confirm
                </Label>
                <Input id="clean-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          {preview && !result && totalDeletable > 0 && (
            <Button variant="destructive" size="sm" onClick={execute} disabled={pending || confirmText !== "DELETE TEST DATA"}>
              {pending ? "Deleting…" : "Delete test data"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetCrmDataDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<"warn" | "confirm" | "final">("warn");
  const [password, setPassword] = React.useState("");
  const [phrase, setPhrase] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ResetCrmDataResult | null>(null);

  function reset() {
    setStage("warn");
    setPassword("");
    setPhrase("");
    setError(null);
    setResult(null);
  }

  async function execute() {
    setPending(true);
    setError(null);
    const res = await resetCrmDataAction(password, phrase, true);
    setPending(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    setResult(res);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <RotateCcw className="h-3.5 w-3.5" /> Reset CRM Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <ShieldAlert className="h-4 w-4" /> Reset CRM Data
          </DialogTitle>
          <DialogDescription>Clears business data. Configuration and credentials are never touched.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2">
            <p className="text-sm text-success">{result.message}</p>
            {Object.entries(result.results).map(([tab, count]) => (
              <div key={tab} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{tab}</span>
                <span className="text-text-tertiary">{count < 0 ? "Failed" : `${count} rows cleared`}</span>
              </div>
            ))}
          </div>
        ) : stage === "warn" ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="text-xs text-danger">
                <p className="font-semibold">This clears Leads, Lead Memory, Campaigns, Unknown Senders, and Errors.</p>
                <p className="mt-1">
                  It never touches: admin account, environment secrets, Google/n8n/Cloudinary credentials, Website Registry, Demo Library,
                  Knowledge Base cache, or n8n workflows.
                </p>
              </div>
            </div>
            <p className="text-xs text-text-tertiary">
              Export anything you need from Leads, Campaigns, or Analytics before continuing -- this cannot be undone from within the CRM.
            </p>
          </div>
        ) : stage === "confirm" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">Confirm your admin password</Label>
              <Input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-phrase">
                Type <span className="font-mono font-semibold text-danger">RESET BIGGBEE</span> to confirm
              </Label>
              <Input id="reset-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        ) : (
          <div className="rounded-lg border border-danger/25 bg-danger/10 p-3">
            <p className="text-sm font-semibold text-danger">Final confirmation</p>
            <p className="mt-1 text-xs text-danger">
              This is irreversible. Business data will be permanently cleared from the connected Google Sheet.
            </p>
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && stage === "warn" && (
            <Button variant="destructive" size="sm" onClick={() => setStage("confirm")}>
              Continue
            </Button>
          )}
          {!result && stage === "confirm" && (
            <Button variant="destructive" size="sm" onClick={() => setStage("final")} disabled={!password || phrase !== "RESET BIGGBEE"}>
              Continue
            </Button>
          )}
          {!result && stage === "final" && (
            <Button variant="destructive" size="sm" onClick={execute} disabled={pending}>
              {pending ? "Resetting…" : "Confirm reset"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DataManagementPanel() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CleanTestDataDialog />
      <ResetCrmDataDialog />
      <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
        <Ban className="h-3 w-3" /> Both require your admin session; reset also requires your password.
      </span>
    </div>
  );
}
