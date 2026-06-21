import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { LeadsClient } from "./LeadsClient";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  // AGENTs only ever see their own leads, so the "filter by agent" control is
  // only meaningful for ADMIN/MANAGER.
  const user = await requireUser();
  const canFilterByAgent = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <PageWrapper>
      <PageHeader
        title="Leads"
        description="Enquiry pipeline."
        actions={
          <Link
            href="/leads/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Lead</span>
          </Link>
        }
      />
      {/* useSearchParams() in the client tree requires a Suspense boundary. */}
      <Suspense fallback={null}>
        <LeadsClient canFilterByAgent={canFilterByAgent} />
      </Suspense>
    </PageWrapper>
  );
}
