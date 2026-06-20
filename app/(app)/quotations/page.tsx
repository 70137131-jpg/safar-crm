import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { QuotationListClient } from "./QuotationListClient";

export const metadata: Metadata = {
  title: "Quotations",
};

export default async function QuotationsPage() {
  const user = await getCurrentUser();
  const canCreate = !!user && can(user, "quotations:create");

  return (
    <PageWrapper>
      <PageHeader
        title="Quotations"
        description="Draft, send and track customer quotations."
        actions={
          canCreate ? (
            <Link
              href="/quotations/new"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Quotation</span>
            </Link>
          ) : undefined
        }
      />
      <QuotationListClient />
    </PageWrapper>
  );
}
