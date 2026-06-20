import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCustomerAction } from "@/modules/customers/customers.actions";
import { getLeadAction } from "@/modules/leads/leads.actions";
import { QuotationForm, type InitialTarget } from "../QuotationForm";

interface Props {
  searchParams: Promise<{ customerId?: string; leadId?: string }>;
}

export const metadata: Metadata = {
  title: "New Quotation",
};

export default async function NewQuotationPage({ searchParams }: Props) {
  const { customerId, leadId } = await searchParams;

  // Optional prefill when arriving from a customer or lead page.
  let initialTarget: InitialTarget | null = null;
  if (customerId) {
    const r = await getCustomerAction(customerId);
    if (r.ok) initialTarget = { kind: "customer", id: r.data.id, name: r.data.name };
  } else if (leadId) {
    const r = await getLeadAction(leadId);
    if (r.ok) initialTarget = { kind: "lead", id: r.data.id, name: r.data.contactName };
  }

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Quotations", href: "/quotations" },
          { label: "New Quotation" },
        ]}
      />
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Create Quotation
        </h1>
        <QuotationForm mode="create" initialTarget={initialTarget} />
      </div>
    </PageWrapper>
  );
}
