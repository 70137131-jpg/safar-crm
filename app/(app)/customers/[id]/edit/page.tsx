import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCustomerAction } from "@/modules/customers/customers.actions";
import { CustomerForm } from "../../CustomerForm";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Customer",
};

export default async function EditCustomerPage({ params }: Props) {
  const { id } = await params;
  const result = await getCustomerAction(id);

  if (!result.ok) {
    notFound();
  }

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Customers", href: "/customers" },
          { label: result.data.name, href: `/customers/${id}` },
          { label: "Edit" },
        ]}
      />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Edit Customer
        </h1>
        <CustomerForm mode="edit" customer={result.data} />
      </div>
    </PageWrapper>
  );
}
