import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "./session";

/**
 * For use in Server Components / Server Actions under the (app) route group, where middleware
 * has already guaranteed a valid session exists. Returns null instead of throwing so a page can
 * still degrade gracefully if this is ever called somewhere middleware didn't cover.
 */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const verified = await verifySessionToken(token);
  return verified?.session ?? null;
}
