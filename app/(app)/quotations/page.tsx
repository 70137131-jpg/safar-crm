import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/common/EmptyState";

export default function QuotationsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Quotations" description="Drafts, sent quotes and PDFs." />
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="Quotations module not built yet"
        description="Implementation in Phase 1.8 (TASKS.md)."
      />
    </PageWrapper>
  );
}
