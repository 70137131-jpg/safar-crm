import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getQuotationAction } from "@/modules/quotations/quotations.actions";
import { QuotationForm } from "../../QuotationForm";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Edit Quotation",
};

export default async function EditQuotationPage({ params }: Props) {
  const { id } = await params;
  const result = await getQuotationAction(id);
  if (!result.ok) notFound();

  // Only drafts are editable — the service rejects edits to sent/accepted/expired.
  if (result.data.status !== "DRAFT") {
    redirect(`/quotations/${id}` as Route);
  }

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Quotations", href: "/quotations" },
          { label: result.data.quoteNumber ?? "Draft", href: `/quotations/${id}` },
          { label: "Edit" },
        ]}
      />
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Edit Quotation
        </h1>
        <QuotationForm mode="edit" quotation={result.data} />
      </div>
    </PageWrapper>
  );
}
