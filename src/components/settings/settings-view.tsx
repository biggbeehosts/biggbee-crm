"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Building2, Compass, RefreshCw, Sheet, ShieldCheck, Workflow, Palette, Trash2, ArrowRight, TriangleAlert, Users } from "lucide-react";
import { DataManagementPanel } from "./data-management-panel";
import { AccountsPanel } from "./accounts-panel";
import type { ConnectionStatus, KnowledgeBaseRecord, Workspace } from "@/types";
import type { EnvValidation } from "@/lib/config/env-validation";
import type { N8nActionKey } from "@/lib/n8n/config";
import type { AccountSummary } from "@/lib/actions/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { IconBadge } from "@/components/ui/icon-badge";
import { daysSince, formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { refreshDataAction } from "@/lib/actions/leads";
import { reopenSetupGuideAction } from "@/lib/auth/actions";
import { useUIState } from "@/components/layout/ui-state-provider";
import { useN8nAction } from "@/lib/n8n/hooks";

interface N8nActionStatus {
  action: N8nActionKey;
  label: string;
  configured: boolean;
}

export function SettingsView({
  status,
  env,
  knowledgeBase,
  refreshKbConfigured,
  n8nActions,
  currentWorkspace,
  isFullAdmin,
  allWorkspaces,
  initialAccounts,
}: {
  status: ConnectionStatus;
  env: EnvValidation;
  knowledgeBase: KnowledgeBaseRecord;
  refreshKbConfigured: boolean;
  n8nActions: N8nActionStatus[];
  currentWorkspace: Workspace | null;
  isFullAdmin: boolean;
  allWorkspaces: Workspace[];
  initialAccounts: AccountSummary[];
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useUIState();
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [reopeningGuide, setReopeningGuide] = React.useState(false);

  async function reopenSetupGuide() {
    setReopeningGuide(true);
    await reopenSetupGuideAction();
    router.push("/dashboard");
    router.refresh();
    setReopeningGuide(false);
  }
  const { run, pendingAction } = useN8nAction({ refreshKb: refreshKbConfigured });
  const kbAge = daysSince(knowledgeBase.updatedAt);
  const kbFresh = kbAge !== null && kbAge <= 1;
  const kbSyncing = pendingAction === "refreshKb";

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    await refreshDataAction();
    const res = await fetch("/api/health");
    const data = await res.json();
    setTestResult(
      data.mode === "mock"
        ? "Running in mock mode — set DATA_MODE=sheets and add Google credentials in .env.local to connect the live sheet."
        : data.dataSourceConnected
          ? "Connected — the Leads sheet is reachable."
          : "Connection failed — check the service account credentials and that the sheet is shared with the service account email."
    );
    router.refresh();
    setTesting(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Building2} tone="accent" />
            <div>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>The sending identity every campaign in this workspace uses -- read-only for now</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentWorkspace ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">Workspace</span>
                <span className="text-xs font-medium text-text-secondary">{currentWorkspace.workspaceName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">Sender name</span>
                <span className="text-xs font-medium text-text-secondary">{currentWorkspace.senderDisplayName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">Sender email</span>
                <span className="font-mono text-xs text-text-secondary">{currentWorkspace.senderEmail}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">Reply-to</span>
                <span className="font-mono text-xs text-text-secondary">{currentWorkspace.replyToEmail}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">Report email</span>
                <span className="font-mono text-xs text-text-secondary">{currentWorkspace.reportEmail}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">Website</span>
                <span className="text-xs font-medium text-text-secondary">{currentWorkspace.website}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">SMTP</span>
                <Badge variant={currentWorkspace.smtpCredentialRef ? "lime" : "outline"}>
                  {currentWorkspace.smtpCredentialRef ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-tertiary">IMAP</span>
                <Badge variant={currentWorkspace.imapCredentialRef ? "lime" : "outline"}>
                  {currentWorkspace.imapCredentialRef ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <p className="pt-1 text-[11px] text-text-tertiary">
                Sending identity and SMTP/IMAP routing aren&apos;t editable here yet -- this is a read-only view of what&apos;s already live.
              </p>
            </>
          ) : (
            <p className="text-xs text-text-tertiary">This workspace could not be loaded.</p>
          )}
        </CardContent>
      </Card>

      {isFullAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <IconBadge icon={Users} />
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>Who can log into this CRM, and which workspace(s) each login can see</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AccountsPanel workspaces={allWorkspaces} initialAccounts={initialAccounts} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Sheet} tone="accent" />
            <div>
              <CardTitle>Google Sheets</CardTitle>
              <CardDescription>The workflow&apos;s spreadsheet is the only data source for this dashboard</CardDescription>
            </div>
          </div>
          <Badge variant={status.mode === "mock" ? "accent" : status.connected ? "lime" : "danger"}>
            {status.mode === "mock" ? "Mock mode" : status.connected ? "Connected" : "Error"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Data source</span>
            <span className="text-xs font-medium text-text-secondary">
              {status.mode === "mock" ? "Mock data" : "Google Sheets"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Connection</span>
            <span className={`text-xs font-medium ${status.connected ? "text-success" : "text-danger"}`}>
              {status.mode === "mock" ? "Not applicable" : status.connected ? "Connected" : "Failed"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Spreadsheet ID</span>
            <span className="font-mono text-xs text-text-secondary">{status.spreadsheetIdMasked || "Not configured"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Last sync</span>
            <span className="text-xs text-text-secondary">{status.lastSuccessfulSync ? formatDateTime(status.lastSuccessfulSync) : "—"}</span>
          </div>
          {status.error && <p className="text-xs text-danger">{status.error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={testConnection} disabled={testing}>
              <RefreshCw className={testing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Test connection
            </Button>
            {testResult && <p className="text-xs text-text-tertiary">{testResult}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={BookOpen} tone="accent" />
            <div>
              <CardTitle>Knowledge Base</CardTitle>
              <CardDescription>The n8n-crawled biggbees.com content the AI uses as its source of truth</CardDescription>
            </div>
          </div>
          <Badge variant={kbFresh ? "lime" : "warning"}>{kbFresh ? "In sync" : knowledgeBase.updatedAt ? "May be stale" : "Never synced"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Last synced</span>
            <span className="text-xs text-text-secondary">
              {knowledgeBase.updatedAt ? `${formatRelativeTime(knowledgeBase.updatedAt)} — ${formatDateTime(knowledgeBase.updatedAt)}` : "Never"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-tertiary">Sections</span>
            <span className="text-xs text-text-secondary">{knowledgeBase.sourceCount}</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => run("refreshKb")} disabled={kbSyncing || !refreshKbConfigured}>
              <BookOpen className={kbSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              {kbSyncing ? "Syncing…" : "Sync now"}
            </Button>
            {!refreshKbConfigured && (
              <p className="text-xs text-text-tertiary">Set N8N_WEBHOOK_REFRESH_KB in .env.production to enable this.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={ShieldCheck} />
            <div>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Environment check — variable names only, never values</CardDescription>
            </div>
          </div>
          <Badge variant={env.valid ? "success" : "danger"}>{env.valid ? "Ready" : `${env.errors.length} to fix`}</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {env.valid && env.warnings.length === 0 && (
            <p className="text-xs text-text-tertiary">All required variables are set.</p>
          )}
          {[...env.errors, ...env.warnings].map((issue) => (
            <div
              key={`${issue.variable}-${issue.level}`}
              className={`rounded-lg border p-2.5 ${
                issue.level === "error" ? "border-danger/25 bg-danger/10" : "border-warning/25 bg-warning/10"
              }`}
            >
              <p className={`font-mono text-[11px] font-medium ${issue.level === "error" ? "text-danger" : "text-warning"}`}>
                {issue.variable}
              </p>
              <p className="mt-0.5 text-[11px] text-text-secondary">{issue.message}</p>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-text-tertiary">
            Edit <span className="font-mono">.env.local</span>, then restart the app — environment variables are read at
            startup.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Workflow} tone="accent" />
            <div>
              <CardTitle>n8n Automation</CardTitle>
              <CardDescription>Which workflow webhooks are connected — never the URLs or the API key</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {n8nActions.map(({ action, label, configured }) => (
            <div key={action} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm">
              <span className="text-text-secondary">{label}</span>
              <Badge variant={configured ? "lime" : "outline"}>{configured ? "Connected" : "Not connected"}</Badge>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-text-tertiary">
            Set the corresponding <span className="font-mono">N8N_WEBHOOK_*</span> variable to connect an action — see the README&apos;s
            n8n integration section.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Palette} />
            <div>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Stored in this browser only</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Dark mode</p>
              <p className="text-xs text-text-tertiary">Default and recommended for the Biggbee visual identity</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Compass} tone="lime" />
            <div>
              <CardTitle>Setup Guide</CardTitle>
              <CardDescription>The Getting Started checklist shown on first login</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-text-tertiary">Reopen it on the Dashboard -- useful if you dismissed it or want to walk through setup again.</p>
            <Button size="sm" variant="secondary" onClick={reopenSetupGuide} disabled={reopeningGuide}>
              <Compass className="h-3.5 w-3.5" /> {reopeningGuide ? "Opening…" : "Open guide"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <IconBadge icon={Trash2} tone="danger" />
            <div>
              <CardTitle>Data Management</CardTitle>
              <CardDescription>Clean tagged test data, or reset all CRM business data -- both real, both admin-protected</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataManagementPanel />
          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-panel px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-text-primary">Individual tracking-event cleanup</p>
              <p className="text-[11px] text-text-tertiary">Mark-as-test, delete-by-month, and retention purge live on Tracking</p>
            </div>
            <Button size="sm" variant="secondary" asChild>
              <Link href="/system/tracking">
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-2.5">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="text-[11px] text-warning">
              Lead Memory and Errors show accurate test-record counts in the preview but can&apos;t be deleted from here yet -- neither has a
              delete function in this codebase today (both are read-only, n8n-owned tabs). Clean Test Data and Reset both skip them and report
              this honestly rather than silently failing.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
