import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { can, ROLES, ROLE_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/permissions";
import { RolesMatrixClient, type Cell, type RoleMatrix } from "@/components/settings/RolesMatrixClient";

export const metadata: Metadata = { title: "Roles & Permissions" };

const RESOURCES = [
  { label: "Customers", prefix: "customers" },
  { label: "Leads", prefix: "leads" },
  { label: "Tasks", prefix: "tasks" },
  { label: "Bookings", prefix: "bookings" },
  { label: "Payments", prefix: "payments" },
  { label: "Quotations", prefix: "quotations" },
  { label: "Documents", prefix: "documents" },
] as const;

// Documents uses "upload" rather than "create"; everything else is verb-aligned.
const VERB: Record<string, Record<"create" | "view" | "update" | "delete", string>> = {
  documents: { create: "upload", view: "view", update: "update", delete: "delete" },
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Full access to every module, plus user management and agency settings.",
  MANAGER: "Manages customers, leads, bookings, payments and quotations; views users and reports; cannot change roles or edit settings.",
  AGENT: "Works their own assigned customers, leads and bookings; records cash payments on own bookings.",
  ACCOUNTANT: "Financial focus — payments, invoices and reports; read-only elsewhere.",
};

function cell(role: (typeof ROLES)[number], prefix: string, action: "create" | "view" | "update" | "delete"): Cell {
  const verb = VERB[prefix]?.[action] ?? action;
  const perm = `${prefix}:${verb}` as Permission;
  if (!(PERMISSIONS as readonly string[]).includes(perm)) return "na";
  return ROLE_PERMISSIONS[role].includes(perm) ? "yes" : "no";
}

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings:view")) redirect("/settings/profile");

  const matrix: RoleMatrix[] = ROLES.map((role) => ({
    role,
    description: ROLE_DESCRIPTIONS[role] ?? "",
    rows: RESOURCES.map((r) => ({
      resource: r.label,
      create: cell(role, r.prefix, "create"),
      view: cell(role, r.prefix, "view"),
      update: cell(role, r.prefix, "update"),
      delete: cell(role, r.prefix, "delete"),
    })),
  }));

  return <RolesMatrixClient matrix={matrix} />;
}
