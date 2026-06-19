import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { ReportsClient } from "./ReportsClient";

export const metadata: Metadata = {
  title: "Reports & Analytics — Safar CRM",
  description: "Business intelligence dashboard with revenue, lead, agent, and payment reports.",
};

export default function ReportsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Reports & Analytics"
        description="Actionable business insights across your pipeline."
      />
      <ReportsClient />
    </PageWrapper>
  );
}
