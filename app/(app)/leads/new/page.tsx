import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { LeadForm } from "../LeadForm";

export const metadata: Metadata = { title: "New Lead" };

export default function NewLeadPage() {
  return (
    <PageWrapper>
      <Breadcrumbs items={[{ label: "Leads", href: "/leads" }, { label: "New Lead" }]} />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Create Lead</h1>
        <LeadForm mode="create" />
      </div>
    </PageWrapper>
  );
}
