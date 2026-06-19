import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import type { Role } from "@/lib/permissions";
import type { UserContext } from "@/lib/permissions/types";
import { auth } from "./server";

/**
 * Read the current Better Auth session. Returns null when unauthenticated.
 * Memoised per request via React `cache()` — multiple calls in the same
 * RSC render share one DB hit.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Build a UserContext from the current session, or null if absent.
 * Use inside server components / server actions.
 */
export async function getCurrentUser(): Promise<UserContext | null> {
  const session = await getSession();
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    role?: Role;
    deactivatedAt?: Date | null;
  };

  if (!user.role) return null;
  if (user.deactivatedAt) return null; // deactivated users have no permissions

  // Attach the actor to Sentry so error traces carry who was acting (id + role
  // only — never PII). No-op when Sentry is disabled (non-prod).
  Sentry.setUser({ id: user.id, role: user.role });

  const hdrs = await headers();
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ip: hdrs.get("x-forwarded-for") ?? undefined,
    userAgent: hdrs.get("user-agent") ?? undefined,
  };
}

/**
 * Use at the top of any protected server component or server action.
 * Redirects to /login when unauthenticated.
 */
export async function requireUser(): Promise<UserContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
