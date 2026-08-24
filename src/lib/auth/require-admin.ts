import "server-only";
import { getCurrentSession } from "./current-session";
import { getAccountByEmail } from "./admin-store";

/**
 * Explicit server-side authorization check for every mutation server action -- defense in depth
 * on top of middleware (which already blocks unauthenticated Server Action requests at the HTTP
 * layer). Throwing here, rather than trusting middleware alone, means an action stays safe even
 * if it's ever called from a context middleware doesn't cover.
 *
 * Also re-checks the account is still active against the live store, not just that the signed
 * cookie is structurally valid -- a deactivated account stops being able to act immediately,
 * rather than only once its session expires. Actions that also need workspace scoping should call
 * requireWorkspaceContext() instead (it performs this same check plus workspace resolution).
 */
export async function requireAdmin(): Promise<string> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Not authenticated.");
  }
  const account = await getAccountByEmail(session.email);
  if (!account || !account.active) {
    throw new Error("Not authenticated.");
  }
  return session.email;
}
