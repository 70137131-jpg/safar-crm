/**
 * Permission catalog — single source of truth.
 * Format: `<resource>:<action>`.
 *
 * Adding a permission requires:
 *   1. Add the string here.
 *   2. Add it to one or more roles in `rbac.ts`.
 *   3. Update the matrix test in `tests/unit/permissions.test.ts`.
 */
export const PERMISSIONS = [
  // Customers
  "customers:create",
  "customers:update",
  "customers:view",
  "customers:delete",
  "customers:import",

  // Leads
  "leads:create",
  "leads:update",
  "leads:view",
  "leads:delete",
  "leads:assign",
  "leads:convert",

  // Interactions
  "interactions:create",
  "interactions:view",
  "interactions:update",
  "interactions:delete",

  // Tasks
  "tasks:create",
  "tasks:update",
  "tasks:view",
  "tasks:assign",

  // Bookings
  "bookings:create",
  "bookings:update",
  "bookings:view",
  "bookings:cancel",

  // Payments
  "payments:create",
  "payments:view",
  "payments:refund",

  // Quotations
  "quotations:create",
  "quotations:update",
  "quotations:view",
  "quotations:send",

  // Invoices
  "invoices:create",
  "invoices:update",
  "invoices:view",
  "invoices:void",

  // Documents
  "documents:upload",
  "documents:view",
  "documents:update",
  "documents:delete",

  // Reports
  "reports:view",
  "reports:financial",
  "reports:export",

  // Settings
  "settings:view",
  "settings:update",

  // Users (admin module)
  "users:view",
  "users:manage",

  // Audit
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["ADMIN", "MANAGER", "AGENT", "ACCOUNTANT"] as const;
export type Role = (typeof ROLES)[number];
