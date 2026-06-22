import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { AuditListClient } from "./AuditListClient";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "audit:view")) redirect("/settings/profile");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="text-sm text-muted-foreground">
          Every mutation across the system — who did it, when, and what changed.
        </p>
      </div>
      {/* useSearchParams() in the client tree requires a Suspense boundary. */}
      <Suspense fallback={null}>
        <AuditListClient />
      </Suspense>
    </section>
  );
}
