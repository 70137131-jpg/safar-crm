import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { PaymentsFinderClient } from "./PaymentsFinderClient";

export const metadata: Metadata = {
  title: "Payments",
};

export default function PaymentsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Payments"
        description="Find a booking to record receipts, refunds and track its balance."
      />
      <PaymentsFinderClient />
    </PageWrapper>
  );
}
