"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldCheck, ShieldOff, Users } from "lucide-react";
import type { Workspace } from "@/types";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  listAccountsAction,
  createRestrictedAccountAction,
  setAccountActiveAction,
  type AccountSummary,
} from "@/lib/actions/workspace";

function grantLabel(workspaceIds: string[] | "all", workspaces: Workspace[]): string {
  if (workspaceIds === "all") return "Full access";
  if (workspaceIds.length === 0) return "No access";
  return workspaceIds.map((id) => workspaces.find((w) => w.workspaceId === id)?.workspaceName ?? id).join(", ");
}

function CreateAccountDialog({ workspaces, onCreated }: { workspaces: Workspace[]; onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setEmail("");
    setPassword("");
    setSelected(new Set());
    setError(null);
  }

  function toggle(workspaceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  }

  async function submit() {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    for (const id of selected) formData.append("workspaceIds", id);
    const result = await createRestrictedAccountAction(formData);
    setPending(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setOpen(false);
    reset();
    onCreated();
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
        <Button variant="secondary" size="sm">
          <UserPlus className="h-3.5 w-3.5" /> Add Account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a restricted login</DialogTitle>
          <DialogDescription>This account will only ever see the workspace(s) checked below -- never all of them, and never anything unchecked.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-account-email">Email</Label>
            <Input id="new-account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-account-password">Password (min. 12 characters)</Label>
            <Input id="new-account-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label>Workspace access</Label>
            <div className="space-y-1.5 rounded-lg border border-border-subtle p-2.5">
              {workspaces.length === 0 && <p className="text-xs text-text-tertiary">No active workspaces to grant.</p>}
              {workspaces.map((w) => (
                <label key={w.workspaceId} className="flex items-center gap-2.5 py-0.5 text-sm text-text-secondary">
                  <Checkbox checked={selected.has(w.workspaceId)} onCheckedChange={() => toggle(w.workspaceId)} />
                  {w.workspaceName}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending || !email || password.length < 12 || selected.size === 0}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin-only account management -- only rendered for a caller with full ("all") access; the
 *  server actions this calls independently re-verify that on every request too (defense in
 *  depth, never trusting this component's own render gate). Starts from the accounts list the
 *  Settings page already fetched server-side -- no client-side fetch-on-mount, only explicit
 *  refreshes after a create/activate/deactivate action actually changes something. */
export function AccountsPanel({ workspaces, initialAccounts }: { workspaces: Workspace[]; initialAccounts: AccountSummary[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<AccountSummary[]>(initialAccounts);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busyEmail, setBusyEmail] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    setAccounts(await listAccountsAction());
    setRefreshing(false);
  }, []);

  async function toggleActive(email: string, active: boolean) {
    setBusyEmail(email);
    await setAccountActiveAction(email, active);
    await load();
    setBusyEmail(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">Every login that can access this CRM, and what it can see.</p>
        <CreateAccountDialog workspaces={workspaces} onCreated={load} />
      </div>
      {refreshing ? (
        <p className="py-4 text-center text-xs text-text-tertiary">Refreshing accounts…</p>
      ) : (
        <div className="space-y-1.5">
          {accounts.map((a) => (
            <div key={a.email} className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{a.email}</p>
                <p className="truncate text-[11px] text-text-tertiary">{grantLabel(a.workspaceIds, workspaces)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={a.active ? "lime" : "outline"}>{a.active ? "Active" : "Deactivated"}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleActive(a.email, !a.active)}
                  disabled={busyEmail === a.email}
                  title={a.active ? "Deactivate" : "Activate"}
                >
                  {a.active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
        <Users className="h-3 w-3" /> Changing an existing account&apos;s workspace access isn&apos;t available from this screen yet -- create a new
        account with the right access instead, or ask an operator to update it directly.
      </p>
    </div>
  );
}
