import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { LeadsClient } from "./LeadsClient";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
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
      <LeadsClient />
    </PageWrapper>
  );
}
