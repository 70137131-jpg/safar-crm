import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { CustomerForm } from "../CustomerForm";

export const metadata: Metadata = {
  title: "New Customer",
};

export default function NewCustomerPage() {
  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Customers", href: "/customers" },
          { label: "New Customer" },
        ]}
      />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Create Customer
        </h1>
        <CustomerForm mode="create" />
      </div>
    </PageWrapper>
  );
}
