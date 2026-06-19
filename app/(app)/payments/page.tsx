import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/common/EmptyState";

export default function PaymentsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Payments" description="Manual receipts and balance tracking." />
      <EmptyState
        icon={<CreditCard className="h-8 w-8" />}
        title="Payments module not built yet"
        description="Implementation in Phase 1.7 (TASKS.md)."
      />
    </PageWrapper>
  );
}
