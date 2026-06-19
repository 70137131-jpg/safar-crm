import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EmptyState } from "@/components/common/EmptyState";

export default function BookingsPage() {
  return (
    <PageWrapper>
      <PageHeader title="Bookings" description="Confirmed trips." />
      <EmptyState
        icon={<CalendarCheck className="h-8 w-8" />}
        title="Bookings module not built yet"
        description="Implementation in Phase 1.6 (TASKS.md)."
      />
    </PageWrapper>
  );
}
