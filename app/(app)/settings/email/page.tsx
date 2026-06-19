import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getSettingsAction } from "@/modules/settings/settings.actions";
import { EmailForm } from "./EmailForm";

export const metadata: Metadata = { title: "Email Settings" };

export default async function EmailPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings:update")) redirect("/settings/profile");

  const res = await getSettingsAction();
  if (!res.ok) redirect("/settings/profile");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Email</h2>
        <p className="text-sm text-muted-foreground">Sender identity for transactional emails (Resend).</p>
      </div>
      <EmailForm settings={res.data} />
    </section>
  );
}
