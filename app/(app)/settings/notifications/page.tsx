import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getSettingsAction } from "@/modules/settings/settings.actions";
import { NotificationsForm } from "./NotificationsForm";

export const metadata: Metadata = { title: "Notification Settings" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings:update")) redirect("/settings/profile");

  const res = await getSettingsAction();
  if (!res.ok) redirect("/settings/profile");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Choose which automated reminders are sent and how far in advance.
        </p>
      </div>
      <NotificationsForm settings={res.data} />
    </section>
  );
}
