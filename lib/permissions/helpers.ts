import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { ROLE_PERMISSIONS } from "./rbac";
import type { OwnableResource, Permission, Role, UserContext } from "./types";

/**
 * Returns true iff `user` may perform `permission`. If `resource` is given
 * and has an `assignedAgentId`, AGENT role is restricted to owned records.
 *
 * Never inline a role check at the call site. Always go through `can()`
 * or `requirePermission()`.
 */
export function can(
  user: UserContext | null | undefined,
  permission: Permission,
  resource?: OwnableResource | null,
): boolean {
  if (!user) return false;

  const allowed = ROLE_PERMISSIONS[user.role];
  if (!allowed.includes(permission)) return false;

  // Ownership scoping — AGENT only sees/edits records assigned to them.
  if (user.role === "AGENT" && resource && resource.assignedAgentId !== undefined) {
    return resource.assignedAgentId === user.id;
  }

  return true;
}

/**
 * Throws on failure. Use at the top of every server action (mandatory by policy).
 */
export function requirePermission(
  user: UserContext | null | undefined,
  permission: Permission,
  resource?: OwnableResource | null,
): asserts user is UserContext {
  if (!user) {
    throw new UnauthorizedError("Authentication required");
  }
  if (!can(user, permission, resource)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/**
 * Require the user to hold AT LEAST ONE of the supplied roles.
 * Prefer `requirePermission()` — only use this for genuinely role-shaped checks
 * (e.g., admin-only screens).
 */
export function requireRole(
  user: UserContext | null | undefined,
  ...roles: Role[]
): asserts user is UserContext {
  if (!user) throw new UnauthorizedError("Authentication required");
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Required role: ${roles.join(" or ")}`);
  }
}
