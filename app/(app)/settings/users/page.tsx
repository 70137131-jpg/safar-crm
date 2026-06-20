import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { UsersClient } from "./UsersClient";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await getCurrentUser();
  // Viewing the team needs users:view (ADMIN, MANAGER). Others fall back to
  // their own profile, mirroring the roles page.
  if (!user || !can(user, "users:view")) redirect("/settings/profile");

  // Only ADMIN (users:manage) gets the create/edit/role/reset/deactivate actions;
  // MANAGER sees a read-only roster.
  const canManage = can(user, "users:manage");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-sm text-muted-foreground">
          Manage team members, roles and access. Approve new sign-ups here by
          reactivating their account.
        </p>
      </div>
      <UsersClient canManage={canManage} />
    </section>
  );
}
