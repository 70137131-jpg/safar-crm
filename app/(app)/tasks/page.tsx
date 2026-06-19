import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/common/EmptyState";

export default function TasksPage() {
  return (
    <PageWrapper>
      <PageHeader title="Tasks" description="Follow-ups, reminders and overdue items." />
      <EmptyState
        icon={<ListChecks className="h-8 w-8" />}
        title="Tasks module not built yet"
        description="Implementation in Phase 1.5 (TASKS.md)."
      />
    </PageWrapper>
  );
}
