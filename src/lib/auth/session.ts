import { hmacSign, hmacVerify } from "./edge-crypto";

export const SESSION_COOKIE = "biggbee_session";

/** Inactivity timeout per issued cookie. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
/** Hard cap since original login, regardless of activity -- must re-enter password after this. */
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Reissue the cookie (sliding expiry) once less than this much of the TTL remains. */
const REISSUE_THRESHOLD_MS = SESSION_TTL_MS / 2;

export interface SessionPayload {
  email: string;
  /** Authorized workspace grants as of login/last reissue -- a convenience hint carried in the
   *  signed cookie, never trusted on its own for an authorization decision. Every real read/write
   *  re-checks the account's CURRENT grants from the store (see workspace-context.ts), so a grant
   *  revoked mid-session stops working immediately rather than at next login. */
  workspaceIds: string[] | "all";
  /** The workspace this session is currently operating in. Always re-validated server-side against
   *  the account's live grants before use -- never trusted as already-authorized just because it's
   *  present in a signed cookie (grants can shrink after the cookie was issued). */
  activeWorkspaceId: string;
  loginAt: number;
  exp: number;
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function encode(payload: SessionPayload): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSign(body);
  return `${body}.${signature}`;
}

async function decode(token: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!(await hmacVerify(body, signature))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (typeof payload.email !== "string" || typeof payload.exp !== "number" || typeof payload.loginAt !== "number") return null;
    if (typeof payload.activeWorkspaceId !== "string" || !payload.activeWorkspaceId) return null;
    if (payload.workspaceIds !== "all" && !Array.isArray(payload.workspaceIds)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSessionToken(email: string, workspaceIds: string[] | "all", activeWorkspaceId: string): Promise<string> {
  const now = Date.now();
  return encode({ email: email.toLowerCase(), workspaceIds, activeWorkspaceId, loginAt: now, exp: now + SESSION_TTL_MS });
}

/**
 * Verifies a cookie value. Returns the valid session, or null if missing/expired/tampered.
 * If the session is still valid but nearing its inactivity timeout (and within the absolute
 * session-age cap), also returns a freshly-signed token the caller should re-set as the cookie --
 * this is what gives an active admin a sliding session without ever needing a "remember me".
 */
export async function verifySessionToken(
  token: string | undefined
): Promise<{ session: SessionPayload; reissue: string | null } | null> {
  if (!token) return null;
  const payload = await decode(token);
  if (!payload) return null;
  const now = Date.now();
  if (now >= payload.exp) return null;
  if (now - payload.loginAt >= MAX_SESSION_AGE_MS) return null;

  let reissue: string | null = null;
  if (payload.exp - now < REISSUE_THRESHOLD_MS) {
    const nextExp = Math.min(now + SESSION_TTL_MS, payload.loginAt + MAX_SESSION_AGE_MS);
    reissue = await encode({
      email: payload.email,
      workspaceIds: payload.workspaceIds,
      activeWorkspaceId: payload.activeWorkspaceId,
      loginAt: payload.loginAt,
      exp: nextExp,
    });
  }
  return { session: payload, reissue };
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = Math.floor(MAX_SESSION_AGE_MS / 1000);

export function sessionCookieOptions(maxAgeSeconds: number = Math.floor(SESSION_TTL_MS / 1000)) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
