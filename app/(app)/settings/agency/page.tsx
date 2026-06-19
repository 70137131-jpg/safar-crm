import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getSettingsAction } from "@/modules/settings/settings.actions";
import { AgencyForm } from "./AgencyForm";

export const metadata: Metadata = { title: "Agency Settings" };

export default async function AgencyPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings:update")) redirect("/settings/profile");

  const res = await getSettingsAction();
  if (!res.ok) redirect("/settings/profile");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Agency</h2>
        <p className="text-sm text-muted-foreground">
          Profile used across quotations, invoices and emails.
        </p>
      </div>
      <AgencyForm settings={res.data} />
    </section>
  );
}
