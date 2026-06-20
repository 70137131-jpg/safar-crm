import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getCustomerAction } from "@/modules/customers/customers.actions";
import { CustomerDetailClient } from "./CustomerDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getCustomerAction(id);
  return {
    title: result.ok ? result.data.name : "Customer",
  };
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getCustomerAction(id);

  if (!result.ok) {
    notFound();
  }

  const user = await getCurrentUser();
  const owner = { assignedAgentId: result.data.assignedAgentId };
  const docCaps = {
    canUpload: !!user && can(user, "documents:upload", owner),
    canDelete: !!user && can(user, "documents:delete", owner),
  };
  const bookingCaps = {
    canCreate: !!user && can(user, "bookings:create"),
  };
  const taskCaps = {
    canCreate: !!user && can(user, "tasks:create"),
    canAssign: !!user && can(user, "tasks:assign"),
  };
  const quotationCaps = {
    canCreate: !!user && can(user, "quotations:create"),
  };

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Customers", href: "/customers" },
          { label: result.data.name },
        ]}
      />
      <CustomerDetailClient
        customer={result.data}
        docCaps={docCaps}
        bookingCaps={bookingCaps}
        taskCaps={taskCaps}
        quotationCaps={quotationCaps}
      />
    </PageWrapper>
  );
}
