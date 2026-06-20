import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { getLeadAction } from "@/modules/leads/leads.actions";
import { LeadDetailClient } from "./LeadDetailClient";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await getLeadAction(id);
  return { title: result.ok ? result.data.contactName : "Lead" };
}

export default async function LeadDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;
  const result = await getLeadAction(id);
  if (!result.ok) notFound();

  const user = await getCurrentUser();
  const taskCaps = {
    canCreate: !!user && can(user, "tasks:create"),
    canAssign: !!user && can(user, "tasks:assign"),
  };

  return (
    <PageWrapper>
      <Breadcrumbs
        items={[
          { label: "Leads", href: "/leads" },
          { label: result.data.contactName },
        ]}
      />
      <LeadDetailClient lead={result.data} initialTab={tab} taskCaps={taskCaps} />
    </PageWrapper>
  );
}
