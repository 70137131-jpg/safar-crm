import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { InvoiceListClient } from "./InvoiceListClient";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "invoices:view")) notFound();
  const caps = {
    canUpdate: !!user && can(user, "invoices:update"),
    canVoid: !!user && can(user, "invoices:void"),
  };
  return (
    <PageWrapper>
      <PageHeader title="Invoices" description="Issued invoices across all bookings." />
      <InvoiceListClient caps={caps} />
    </PageWrapper>
  );
}
