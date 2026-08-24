"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCurrentSession } from "@/lib/auth/current-session";
import { getAccountByEmail, getAccounts, createRestrictedAccount, updateAccountWorkspaces, setAccountActive } from "@/lib/auth/admin-store";
import { isWorkspaceAuthorized } from "@/lib/auth/workspace-context";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { getWorkspace, getActiveWorkspaces } from "@/lib/data/workspace-store";
import { logAudit } from "@/lib/audit/log";
import type { ActionResult } from "./leads";

/**
 * Switches the signed-in account's active workspace. The requested workspaceId is never trusted
 * just because the client sent it: it's checked against the account's CURRENT grants (a fresh
 * store read, not the possibly-stale grants embedded in the existing session cookie) and against
 * the workspace actually existing and being active, before a new session cookie is issued.
 */
export async function switchWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { success: false, message: "Not authenticated." };

  const account = await getAccountByEmail(session.email);
  if (!account || !account.active) return { success: false, message: "Account is inactive." };

  if (!isWorkspaceAuthorized(account.workspaceIds, workspaceId)) {
    await logAudit({ actor: session.email, action: "workspace.switch_denied", success: false, details: { attempted: workspaceId } });
    return { success: false, message: "You are not authorized for that workspace." };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace || !workspace.active) {
    await logAudit({ actor: session.email, action: "workspace.switch_denied", success: false, details: { attempted: workspaceId, reason: "not_found_or_inactive" } });
    return { success: false, message: "That workspace is not available." };
  }

  const token = await createSessionToken(account.email, account.workspaceIds, workspaceId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  await logAudit({ actor: account.email, action: "workspace.switch", success: true, details: { workspaceId } });
  revalidatePath("/", "layout");
  return { success: true, message: `Switched to ${workspace.workspaceName}.` };
}

export interface AccountSummary {
  email: string;
  workspaceIds: string[] | "all";
  active: boolean;
  createdAt: string;
}

/** Admin-only: lists every login account. Caller must already have full ("all") access -- an
 *  account restricted to one workspace has no business seeing who else can log in. */
export async function listAccountsAction(): Promise<AccountSummary[]> {
  const email = await requireAdmin();
  const caller = await getAccountByEmail(email);
  if (!caller || caller.workspaceIds !== "all") {
    throw new Error("Only a full-access admin can view accounts.");
  }
  const accounts = await getAccounts();
  return accounts.map((a) => ({ email: a.email, workspaceIds: a.workspaceIds, active: a.active, createdAt: a.createdAt }));
}

const CreateAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "Password must be at least 12 characters."),
  workspaceIds: z.array(z.string()).min(1, "Select at least one workspace."),
});

/** Admin-only: creates a new login restricted to the given workspaces. Every requested
 *  workspaceId is validated against real, currently-active workspaces -- a typo or a
 *  deactivated/unknown id is rejected rather than silently granted. */
export async function createRestrictedAccountAction(formData: FormData): Promise<ActionResult> {
  const email = await requireAdmin();
  const caller = await getAccountByEmail(email);
  if (!caller || caller.workspaceIds !== "all") {
    return { success: false, message: "Only a full-access admin can create accounts." };
  }

  const parsed = CreateAccountSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceIds: formData.getAll("workspaceIds").map(String),
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const active = await getActiveWorkspaces();
  const activeIds = new Set(active.map((w) => w.workspaceId));
  const invalid = parsed.data.workspaceIds.filter((id) => !activeIds.has(id));
  if (invalid.length > 0) {
    return { success: false, message: `Unknown or inactive workspace(s): ${invalid.join(", ")}.` };
  }

  try {
    const account = await createRestrictedAccount(parsed.data.email, parsed.data.password, parsed.data.workspaceIds);
    await logAudit({ actor: email, action: "account.create", target: account.email, success: true, details: { workspaceIds: account.workspaceIds } });
    revalidatePath("/settings");
    return { success: true, message: `Account "${account.email}" created with access to ${parsed.data.workspaceIds.length} workspace(s).` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create account.";
    await logAudit({ actor: email, action: "account.create_failed", success: false, details: { error: message } });
    return { success: false, message };
  }
}

const UpdateGrantsSchema = z.object({
  email: z.string().email(),
  grantAll: z.boolean(),
  workspaceIds: z.array(z.string()),
});

/** Admin-only: changes an existing account's workspace grants. A full-access admin can never
 *  demote themselves this way (self-lockout guard) -- someone else with "all" access must do it. */
export async function updateAccountWorkspacesAction(formData: FormData): Promise<ActionResult> {
  const email = await requireAdmin();
  const caller = await getAccountByEmail(email);
  if (!caller || caller.workspaceIds !== "all") {
    return { success: false, message: "Only a full-access admin can manage accounts." };
  }

  const parsed = UpdateGrantsSchema.safeParse({
    email: formData.get("email"),
    grantAll: formData.get("grantAll") === "true",
    workspaceIds: formData.getAll("workspaceIds").map(String),
  });
  if (!parsed.success) {
    return { success: false, message: "Invalid input." };
  }
  if (parsed.data.email.toLowerCase() === email.toLowerCase()) {
    return { success: false, message: "You cannot change your own access level." };
  }

  const nextGrant: string[] | "all" = parsed.data.grantAll ? "all" : parsed.data.workspaceIds;
  if (nextGrant !== "all" && nextGrant.length === 0) {
    return { success: false, message: "Select at least one workspace, or grant full access." };
  }

  try {
    await updateAccountWorkspaces(parsed.data.email, nextGrant);
    await logAudit({ actor: email, action: "account.update_workspaces", target: parsed.data.email, success: true, details: { workspaceIds: nextGrant } });
    revalidatePath("/settings");
    return { success: true, message: "Access updated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update access.";
    return { success: false, message };
  }
}

/** Admin-only: activate/deactivate a login. A deactivated account is immediately locked out of
 *  every future request (requireAdmin/requireWorkspaceContext re-check `active` live), not just
 *  new logins. Self-deactivation is blocked the same way self-demotion is. */
export async function setAccountActiveAction(targetEmail: string, active: boolean): Promise<ActionResult> {
  const email = await requireAdmin();
  const caller = await getAccountByEmail(email);
  if (!caller || caller.workspaceIds !== "all") {
    return { success: false, message: "Only a full-access admin can manage accounts." };
  }
  if (targetEmail.toLowerCase() === email.toLowerCase()) {
    return { success: false, message: "You cannot deactivate your own account." };
  }

  try {
    await setAccountActive(targetEmail, active);
    await logAudit({ actor: email, action: active ? "account.activate" : "account.deactivate", target: targetEmail, success: true });
    revalidatePath("/settings");
    return { success: true, message: active ? "Account activated." : "Account deactivated." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update account.";
    return { success: false, message };
  }
}
