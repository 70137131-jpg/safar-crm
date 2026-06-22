import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsNav } from "@/components/settings/SettingsNav";

/**
 * Settings shell: permission-aware sub-nav + content. Everyone sees Profile;
 * Users/Roles need `users:view`/`settings:view`; the editable agency/email/
 * notification panels need `settings:update` (ADMIN).
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  const allowed: string[] = ["/settings/profile"];
  if (user && can(user, "users:view")) allowed.push("/settings/users");
  if (user && can(user, "settings:update")) {
    allowed.push(
      "/settings/agency",
      "/settings/lead-sources",
      "/settings/email",
      "/settings/notifications",
    );
  }
  if (user && can(user, "settings:view")) allowed.push("/settings/roles");
  if (user && can(user, "audit:view")) allowed.push("/settings/audit");

  return (
    <PageWrapper>
      <PageHeader title="Settings" description="Manage your account, team and agency configuration." />
      <div className="flex flex-col gap-6 md:flex-row">
        <SettingsNav allowed={allowed} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageWrapper>
  );
}
