import type { Permission, Role } from "./permissions";

/**
 * Role → granted permissions.
 *
 * Ownership scoping ("AGENT sees own assigned records") is layered on
 * top inside `can()` (see helpers.ts) — this map only says whether the
 * role MAY perform the action at all.
 *
 * Mirror: ARCHITECTURE.md §6.2.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlyArray<Permission>> = {
  ADMIN: [
    "customers:create", "customers:update", "customers:view", "customers:delete", "customers:import",
    "leads:create", "leads:update", "leads:view", "leads:delete", "leads:assign", "leads:convert",
    "interactions:create", "interactions:view", "interactions:update", "interactions:delete",
    "tasks:create", "tasks:update", "tasks:view", "tasks:assign",
    "bookings:create", "bookings:update", "bookings:view", "bookings:cancel",
    "payments:create", "payments:view", "payments:refund",
    "quotations:create", "quotations:update", "quotations:view", "quotations:send",
    "invoices:create", "invoices:update", "invoices:view", "invoices:void",
    "documents:upload", "documents:view", "documents:update", "documents:delete",
    "reports:view", "reports:financial", "reports:export",
    "settings:view", "settings:update",
    "users:view", "users:manage",
    "audit:view",
  ],

  MANAGER: [
    "customers:create", "customers:update", "customers:view", "customers:delete", "customers:import",
    "leads:create", "leads:update", "leads:view", "leads:delete", "leads:assign", "leads:convert",
    "interactions:create", "interactions:view", "interactions:update", "interactions:delete",
    "tasks:create", "tasks:update", "tasks:view", "tasks:assign",
    "bookings:create", "bookings:update", "bookings:view", "bookings:cancel",
    "payments:create", "payments:view", "payments:refund",
    "quotations:create", "quotations:update", "quotations:view", "quotations:send",
    "invoices:view",
    "documents:upload", "documents:view", "documents:update",
    "reports:view", "reports:financial", "reports:export",
    "settings:view",
    "users:view",
    "audit:view",
  ],

  AGENT: [
    "customers:create", "customers:update", "customers:view",
    "leads:create", "leads:update", "leads:view", "leads:convert",
    "interactions:create", "interactions:view", "interactions:update", "interactions:delete",
    "tasks:create", "tasks:update", "tasks:view",
    "bookings:create", "bookings:update", "bookings:view",
    "payments:create", "payments:view",
    "quotations:create", "quotations:update", "quotations:view", "quotations:send",
    "documents:upload", "documents:view", "documents:update",
    "reports:view",
  ],

  ACCOUNTANT: [
    "customers:view",
    "leads:view",
    "interactions:view",
    "tasks:view",
    "bookings:view",
    "payments:create", "payments:view", "payments:refund",
    "quotations:view",
    "invoices:create", "invoices:update", "invoices:view", "invoices:void",
    "documents:view",
    "reports:view", "reports:financial", "reports:export",
  ],
};
