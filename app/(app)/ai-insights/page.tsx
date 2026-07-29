import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions";
import { env } from "@/lib/env";
import { AiWorkspaceClient } from "./AiWorkspaceClient";

export const metadata: Metadata = {
  title: "AI Workspace",
  description: "Explainable AI insights and review-gated CRM workflows.",
};

export default async function AiInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    documentId?: string;
    leadId?: string;
    customerId?: string;
    quotationId?: string;
  }>;
}) {
  const user = await requireUser();
  requirePermission(user, "assistant:use");
  const query = await searchParams;

  return (
    <PageWrapper>
      <PageHeader
        title="AI Workspace"
        description="Scoring, drafting, document intelligence, search, recommendations, reporting, and forecasts."
      />
      <AiWorkspaceClient
        configured={Boolean(env.GEMINI_API_KEY)}
        initialDocumentId={query.documentId ?? ""}
        initialLeadId={query.leadId ?? ""}
        initialCustomerId={query.customerId ?? ""}
        initialQuotationId={query.quotationId ?? ""}
      />
    </PageWrapper>
  );
}
