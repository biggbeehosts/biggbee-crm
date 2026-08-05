import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/session";

export const config = {
  matcher: [
    // Everything except: the health check, tracking pixel/click endpoints (Stage 5 -- email
    // clients hit these with zero session cookie, so they must never be redirected to /login or
    // 401'd; each route validates its own token and is independently rate-limited), the internal
    // n8n->CRM event endpoint (Stage 5 -- server-to-server, authenticated by its own X-API-KEY
    // check against N8N_API_KEY, not a browser session), static assets, and Next internals.
    // /login and /setup ARE matched -- they still get CSRF + CSP treatment, just not the auth
    // redirect below.
    "/((?!api/health|api/track|api/internal|_next/static|_next/image|favicon.ico).*)",
  ],
};

const SESSION_COOKIE = "biggbee_session";
const PUBLIC_PATHS = new Set(["/login", "/setup"]);

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin navigations/GET requests don't send Origin
  try {
    const originHost = new URL(origin).host;
    return originHost === req.headers.get("host");
  } catch {
    return false;
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function cspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const isMutation = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const isServerAction = req.headers.has("next-action");
  const isPublicPath = PUBLIC_PATHS.has(req.nextUrl.pathname);

  // Defense-in-depth same-origin check for anything that changes state. Next.js Server Actions
  // already enforce this internally; this covers any current/future POST route handler too.
  if (isMutation && !isSameOrigin(req)) {
    return new NextResponse("Cross-origin request blocked.", { status: 403 });
  }

  const nonce = randomNonce();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  if (!isPublicPath) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const verified = await verifySessionToken(token);

    if (!verified) {
      if (isServerAction) {
        return new NextResponse("Unauthorized -- please sign in again.", { status: 401 });
      }
      if (req.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", cspHeader(nonce));
    if (verified.reissue) {
      res.cookies.set(SESSION_COOKIE, verified.reissue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }
    return res;
  }

  // /login and /setup: no auth required, but still get a nonce + CSP.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", cspHeader(nonce));
  return res;
}
