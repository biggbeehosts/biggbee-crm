import "server-only";
import { getCurrentSession } from "./current-session";

/**
 * Explicit server-side authorization check for every mutation server action -- defense in depth
 * on top of middleware (which already blocks unauthenticated Server Action requests at the HTTP
 * layer). Throwing here, rather than trusting middleware alone, means an action stays safe even
 * if it's ever called from a context middleware doesn't cover.
 */
export async function requireAdmin(): Promise<string> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Not authenticated.");
  }
  return session.email;
}
