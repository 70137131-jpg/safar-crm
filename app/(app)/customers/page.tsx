import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { CustomerListClient } from "./CustomerListClient";

export const metadata: Metadata = {
  title: "Customers",
};

export default function CustomersPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Customers"
        description="Master customer records."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/customers/import"
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Link>
            <Link
              href="/customers/new"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Customer</span>
            </Link>
          </div>
        }
      />
      <CustomerListClient />
    </PageWrapper>
  );
}
