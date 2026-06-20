import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getQuotationAction } from "@/modules/quotations/quotations.actions";
import { QuotationDetailClient } from "./QuotationDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getQuotationAction(id);
  return {
    title: result.ok ? (result.data.quoteNumber ?? "Quotation") : "Quotation",
  };
}

export default async function QuotationDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getQuotationAction(id);
  if (!result.ok) notFound();

  const user = await getCurrentUser();
  const owner = {
    assignedAgentId:
      result.data.customer?.assignedAgentId ??
      result.data.lead?.assignedAgentId ??
      null,
  };
  const caps = {
    canEdit: !!user && can(user, "quotations:update", owner),
    canSend: !!user && can(user, "quotations:send", owner),
  };

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Quotations", href: "/quotations" },
          { label: result.data.quoteNumber ?? "Draft" },
        ]}
      />
      <QuotationDetailClient
        key={result.data.id}
        quotation={result.data}
        caps={caps}
      />
    </PageWrapper>
  );
}
