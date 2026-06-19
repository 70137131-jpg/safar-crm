import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { DashboardStats } from "./DashboardStats";
import { BookingStats } from "./BookingStats";
import { QuotationStats } from "./QuotationStats";
import { TasksWidget } from "./TasksWidget";
import { RecentLeads } from "./RecentLeads";
import { UpcomingTravel } from "./UpcomingTravel";
import { RecentPayments } from "./RecentPayments";

export const metadata: Metadata = {
  title: "Dashboard",
};

import { Card, CardContent } from "@/components/ui/card";

function WidgetSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <LoadingSkeleton className="mb-4 h-4 w-28" />
        <div className="space-y-3">
          <LoadingSkeleton className="h-10 w-full" />
          <LoadingSkeleton className="h-10 w-full" />
          <LoadingSkeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <LoadingSkeleton className="mb-2 h-4 w-24" />
            <LoadingSkeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Dashboard"
        description="Pipeline overview, revenue and reminders."
      />

      <div className="space-y-6">
        <Suspense fallback={<StatsSkeleton />}>
          <DashboardStats />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<WidgetSkeleton />}>
            <BookingStats />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton />}>
            <QuotationStats />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<WidgetSkeleton />}>
            <TasksWidget />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton />}>
            <RecentLeads />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<WidgetSkeleton />}>
            <UpcomingTravel />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton />}>
            <RecentPayments />
          </Suspense>
        </div>
      </div>
    </PageWrapper>
  );
}
