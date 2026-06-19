import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getLeadAction } from "@/modules/leads/leads.actions";
import { LeadForm } from "../../LeadForm";

export const metadata: Metadata = { title: "Edit Lead" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditLeadPage({ params }: Props) {
  const { id } = await params;
  const result = await getLeadAction(id);
  if (!result.ok) notFound();

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Leads", href: "/leads" },
          { label: result.data.contactName, href: `/leads/${id}` },
          { label: "Edit" },
        ]}
      />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Edit Lead</h1>
        <LeadForm mode="edit" lead={result.data} />
      </div>
    </PageWrapper>
  );
}
