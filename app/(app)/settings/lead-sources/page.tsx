import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getSettingsAction } from "@/modules/settings/settings.actions";
import { LeadSourcesForm } from "./LeadSourcesForm";

export const metadata: Metadata = { title: "Lead Sources" };

export default async function LeadSourcesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings:update")) redirect("/settings/profile");

  const res = await getSettingsAction();
  if (!res.ok) redirect("/settings/profile");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lead sources</h2>
        <p className="text-sm text-muted-foreground">
          The options agents pick from when recording where a lead came from.
        </p>
      </div>
      <LeadSourcesForm leadSources={res.data.leadSources} />
    </section>
  );
}
