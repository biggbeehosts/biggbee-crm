import "server-only";
import { redirect } from "next/navigation";
import type { Workspace } from "@/types";
import { getCurrentSession } from "./current-session";
import { getAccountByEmail } from "./admin-store";
import { getWorkspace, getActiveWorkspaces } from "@/lib/data/workspace-store";

export interface WorkspaceContext {
  email: string;
  /** The account's CURRENT grants, read fresh from the store on every call -- never the possibly
   *  stale copy embedded in the signed session cookie. */
  workspaceIds: string[] | "all";
  /** The validated, currently-active workspace this request is scoped to. Every workspace-scoped
   *  read/write in the app should use this value and nothing else -- never a workspaceId read
   *  directly off the session, a form field, or any other client-supplied source. */
  workspaceId: string;
}

export function isWorkspaceAuthorized(grant: string[] | "all", workspaceId: string): boolean {
  if (grant === "all") return true;
  return grant.includes(workspaceId);
}

/**
 * Live, non-throwing resolution of "who is this request, and which workspace may it act in."
 * Re-checks everything that could have changed since the session cookie was issued: the account
 * might have been deactivated or had its grants narrowed, or the workspace itself might have been
 * deactivated -- any of those invalidates the session's embedded activeWorkspaceId immediately,
 * without waiting for the cookie to expire. Returns null on any failure; callers decide how to
 * degrade (see requireWorkspaceContext / pageWorkspaceContext below).
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const account = await getAccountByEmail(session.email);
  if (!account || !account.active) return null;

  if (!isWorkspaceAuthorized(account.workspaceIds, session.activeWorkspaceId)) return null;

  const workspace = await getWorkspace(session.activeWorkspaceId);
  if (!workspace || !workspace.active) return null;

  return { email: session.email, workspaceIds: account.workspaceIds, workspaceId: workspace.workspaceId };
}

/** For Server Actions / mutations -- throws on failure, matching requireAdmin()'s existing
 *  contract so call sites that already wrap it (or don't) behave the same way as before. */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new Error("Not authenticated, or your workspace access has changed -- please sign in again.");
  return ctx;
}

/** For Server Components (page.tsx files) -- redirects to /login instead of throwing an uncaught
 *  render error. In normal operation this always succeeds (middleware already guarantees a valid
 *  session by the time a page renders); it only actually redirects in the edge case where an
 *  account/workspace was deactivated or regranted after the cookie was issued. */
export async function pageWorkspaceContext(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Every workspace this account may switch into, for the workspace switcher UI -- resolved from
 *  live, active workspace records only (a grant naming a deactivated/deleted workspace is silently
 *  excluded rather than shown as a broken option). */
export async function getAccessibleWorkspaces(workspaceIds: string[] | "all"): Promise<Workspace[]> {
  const active = await getActiveWorkspaces();
  if (workspaceIds === "all") return active;
  return active.filter((w) => workspaceIds.includes(w.workspaceId));
}
