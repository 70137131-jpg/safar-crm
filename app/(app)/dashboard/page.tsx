import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { DashboardStats } from "./DashboardStats";
import { MonthlyTrends } from "./MonthlyTrends";
import { TopDestinations } from "./TopDestinations";
import { BookingStats } from "./BookingStats";
import { QuotationStats } from "./QuotationStats";
import { TasksWidget } from "./TasksWidget";
import { RecentLeads } from "./RecentLeads";
import { UpcomingTravel } from "./UpcomingTravel";
import { RecentPayments } from "./RecentPayments";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Each skeleton below mirrors the widget it stands in for — same card chrome,
 * same header row, same number and size of body rows — so the swap to real
 * content causes no layout shift.
 */

/** Matches the list widgets: TasksWidget, RecentLeads, UpcomingTravel, RecentPayments. */
function ListWidgetSkeleton({
  link = false,
  trailing = "badge",
}: {
  /** Header carries a "View all →" link on the right. */
  link?: boolean;
  /** Shape of each row's right-hand element. */
  trailing?: "badge" | "text" | "stack";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <LoadingSkeleton className="h-4 w-32" />
        {link && <LoadingSkeleton className="h-4 w-14" />}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <LoadingSkeleton className="h-5 w-2/5" />
                <LoadingSkeleton className="h-4 w-3/5" />
              </div>
              {trailing === "badge" && (
                <LoadingSkeleton className="h-[22px] w-20 shrink-0 rounded-full" />
              )}
              {trailing === "text" && <LoadingSkeleton className="h-4 w-16 shrink-0" />}
              {trailing === "stack" && (
                <div className="shrink-0">
                  <LoadingSkeleton className="ml-auto h-4 w-20" />
                  <LoadingSkeleton className="ml-auto h-4 w-12" />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Matches the status-breakdown widgets: BookingStats, QuotationStats. */
function StatGridWidgetSkeleton({ tiles }: { tiles: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <LoadingSkeleton className="h-4 w-4" />
          <LoadingSkeleton className="h-4 w-28" />
        </div>
        <LoadingSkeleton className="h-4 w-14" />
      </CardHeader>
      <CardContent>
        <div>
          <LoadingSkeleton className="h-4 w-28" />
          <LoadingSkeleton className="h-8 w-40" />
        </div>
        <div
          className={cn(
            "mt-4 grid grid-cols-2 gap-2",
            tiles > 4 ? "sm:grid-cols-3" : "sm:grid-cols-4",
          )}
        >
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="bg-muted/30 rounded-md border px-3 py-2">
              <LoadingSkeleton className="h-7 w-8" />
              <LoadingSkeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Matches MonthlyTrends / TopDestinations — icon + title, then a 280px chart. */
function ChartSkeleton({ trailing = false }: { trailing?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <LoadingSkeleton className="h-4 w-4" />
          <LoadingSkeleton className="h-4 w-44" />
        </div>
        {trailing && <LoadingSkeleton className="h-4 w-24" />}
      </CardHeader>
      <CardContent>
        <LoadingSkeleton className="h-[280px] w-full" />
      </CardContent>
    </Card>
  );
}

/** Matches DashboardStats — five cards, each with an accent bar and icon tile. */
function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="bg-muted h-1" />
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <LoadingSkeleton className="h-5 w-24" />
              <LoadingSkeleton className="h-9 w-9" />
            </div>
            <div className="mt-4">
              <LoadingSkeleton className="h-8 w-20" />
              <LoadingSkeleton className="mt-1.5 h-5 w-32" />
            </div>
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
          <Suspense fallback={<ChartSkeleton />}>
            <MonthlyTrends />
          </Suspense>
          <Suspense fallback={<ChartSkeleton trailing />}>
            <TopDestinations />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<StatGridWidgetSkeleton tiles={5} />}>
            <BookingStats />
          </Suspense>
          <Suspense fallback={<StatGridWidgetSkeleton tiles={4} />}>
            <QuotationStats />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<ListWidgetSkeleton link trailing="text" />}>
            <TasksWidget />
          </Suspense>
          <Suspense fallback={<ListWidgetSkeleton link trailing="badge" />}>
            <RecentLeads />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<ListWidgetSkeleton trailing="stack" />}>
            <UpcomingTravel />
          </Suspense>
          <Suspense fallback={<ListWidgetSkeleton trailing="stack" />}>
            <RecentPayments />
          </Suspense>
        </div>
      </div>
    </PageWrapper>
  );
}
