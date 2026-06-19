import { NextResponse, type NextRequest } from "next/server";

/**
 * Session-refresh / quick gate ONLY. Real authorization lives inside server
 * actions via `requirePermission()` (see ARCHITECTURE.md §2.x — middleware-
 * only auth in Next.js has known bypasses).
 *
 * We:
 *   1. Let unprotected paths through.
 *   2. Bounce unauthenticated requests on protected paths to /login.
 *   3. Let everything else through; server components verify the session
 *      against the DB and decide what to render.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/leads",
  "/bookings",
  "/payments",
  "/quotations",
  "/reports",
  "/tasks",
  "/settings",
];

// Better Auth uses the configured `cookiePrefix` ("safar") + ".session_token"
const SESSION_COOKIE_NAMES = ["safar.session_token", "safar.session", "better-auth.session_token"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requiresAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!requiresAuth) return NextResponse.next();

  const hasSession = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *   - /api (handled directly)
     *   - /_next/static, /_next/image
     *   - /favicon.ico and other static assets
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif|css|js)).*)",
  ],
};
