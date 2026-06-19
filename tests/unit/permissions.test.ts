import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  can,
  requirePermission,
  requireRole,
  type Permission,
  type Role,
  type UserContext,
} from "@/lib/permissions";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * RBAC matrix — the authoritative test for the role → permission map and the
 * ownership-scoping rules layered on top by `can()`.
 *
 * Mirrors ARCHITECTURE.md §6.2. Adding/removing a permission MUST update both
 * `lib/permissions/*` and this file.
 */

function user(role: Role, id = `u-${role}`): UserContext {
  return { id, email: `${role}@safarcrm.local`, name: role, role };
}

const admin = user("ADMIN");
const manager = user("MANAGER");
const agent = user("AGENT", "agent-1");
const accountant = user("ACCOUNTANT");

describe("permission catalog integrity", () => {
  it("has no duplicate permission strings", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("every role only grants permissions that exist in the catalog", () => {
    const catalog = new Set<Permission>(PERMISSIONS);
    for (const role of ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(catalog.has(perm)).toBe(true);
      }
    }
  });

  it("no role lists a duplicate permission", () => {
    for (const role of ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      expect(new Set(perms).size).toBe(perms.length);
    }
  });
});

describe("ADMIN — full access", () => {
  it("holds every permission in the catalog", () => {
    for (const perm of PERMISSIONS) {
      expect(can(admin, perm)).toBe(true);
    }
  });
});

describe("MANAGER — all business modules, but not an admin", () => {
  it("can run the full sales/CRM pipeline", () => {
    for (const perm of [
      "customers:create", "customers:delete", "customers:import",
      "leads:create", "leads:assign", "leads:delete", "leads:convert",
      "bookings:create", "bookings:cancel",
      "payments:create", "payments:refund",
      "quotations:send", "reports:financial", "reports:export",
      "users:view", "audit:view",
    ] as Permission[]) {
      expect(can(manager, perm)).toBe(true);
    }
  });

  it("cannot manage users/admins, issue/void invoices, or change settings", () => {
    for (const perm of [
      "users:manage",
      "invoices:create", "invoices:update", "invoices:void",
      "settings:update",
    ] as Permission[]) {
      expect(can(manager, perm)).toBe(false);
    }
  });
});

describe("AGENT — operational, ownership-scoped", () => {
  it("can run day-to-day sales actions", () => {
    for (const perm of [
      "customers:create", "leads:create", "leads:convert",
      "bookings:create", "payments:create", "quotations:send",
      "interactions:create", "tasks:create", "documents:upload",
      "reports:view",
    ] as Permission[]) {
      expect(can(agent, perm)).toBe(true);
    }
  });

  it("is denied privileged / financial / admin actions", () => {
    for (const perm of [
      "customers:delete", "leads:assign", "leads:delete",
      "bookings:cancel", "payments:refund",
      "invoices:create", "invoices:void",
      "reports:financial", "reports:export",
      "settings:view", "settings:update",
      "users:view", "users:manage", "audit:view",
    ] as Permission[]) {
      expect(can(agent, perm)).toBe(false);
    }
  });
});

describe("ACCOUNTANT — financial only", () => {
  it("can handle money + financial reporting", () => {
    for (const perm of [
      "payments:create", "payments:refund",
      "invoices:create", "invoices:update", "invoices:void",
      "reports:financial", "reports:export",
    ] as Permission[]) {
      expect(can(accountant, perm)).toBe(true);
    }
  });

  it("is view-only on CRM entities and cannot create them", () => {
    for (const perm of ["customers:view", "leads:view", "bookings:view"] as Permission[]) {
      expect(can(accountant, perm)).toBe(true);
    }
    for (const perm of [
      "customers:create", "customers:update", "customers:delete",
      "leads:create", "leads:update",
      "bookings:create", "bookings:cancel",
      "quotations:create", "quotations:send",
      "users:view", "settings:update",
    ] as Permission[]) {
      expect(can(accountant, perm)).toBe(false);
    }
  });
});

describe("can() — ownership scoping for AGENT", () => {
  it("allows an AGENT to act on a record assigned to them", () => {
    expect(can(agent, "leads:update", { assignedAgentId: "agent-1" })).toBe(true);
  });

  it("blocks an AGENT from a record assigned to someone else", () => {
    expect(can(agent, "leads:update", { assignedAgentId: "agent-2" })).toBe(false);
  });

  it("blocks an AGENT from an unassigned record", () => {
    expect(can(agent, "leads:update", { assignedAgentId: null })).toBe(false);
  });

  it("does NOT scope ADMIN/MANAGER/ACCOUNTANT by ownership", () => {
    const other = { assignedAgentId: "someone-else" };
    expect(can(admin, "leads:update", other)).toBe(true);
    expect(can(manager, "leads:update", other)).toBe(true);
    // accountant still bounded by the base matrix (no leads:update)
    expect(can(accountant, "leads:view", other)).toBe(true);
  });

  it("ignores ownership when the resource omits assignedAgentId", () => {
    expect(can(agent, "leads:update", {})).toBe(true);
  });
});

describe("can() — guards", () => {
  it("returns false for a null/undefined user", () => {
    expect(can(null, "customers:view")).toBe(false);
    expect(can(undefined, "customers:view")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("passes silently when allowed", () => {
    expect(() => requirePermission(admin, "users:manage")).not.toThrow();
  });

  it("throws ForbiddenError when the role lacks the permission", () => {
    expect(() => requirePermission(agent, "payments:refund")).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError on ownership violation", () => {
    expect(() =>
      requirePermission(agent, "leads:update", { assignedAgentId: "agent-2" }),
    ).toThrow(ForbiddenError);
  });

  it("throws UnauthorizedError when there is no user", () => {
    expect(() => requirePermission(null, "customers:view")).toThrow(UnauthorizedError);
  });
});

describe("requireRole", () => {
  it("passes when the user holds one of the roles", () => {
    expect(() => requireRole(admin, "ADMIN", "MANAGER")).not.toThrow();
  });

  it("throws ForbiddenError when the role is not in the set", () => {
    expect(() => requireRole(agent, "ADMIN", "MANAGER")).toThrow(ForbiddenError);
  });

  it("throws UnauthorizedError when there is no user", () => {
    expect(() => requireRole(null, "ADMIN")).toThrow(UnauthorizedError);
  });
});
