import { PageWrapper } from "@/components/layout/PageWrapper";
import {
  PageHeaderSkeleton,
  ListToolbarSkeleton,
  TableSkeleton,
} from "@/components/common/LoadingSkeleton";

/**
 * Default route-level loading fallback for the authenticated app. Shown during
 * server navigation between (app) segments. Individual pages may still use
 * their own <Suspense> boundaries for finer-grained streaming (e.g. dashboard).
 *
 * Shaped like the list routes it most often covers (customers, leads, bookings,
 * quotations, invoices, payments, tasks): the same `PageWrapper` + `PageHeader`
 * shell those pages render, then the search/filter row and the table.
 */
export default function AppLoading() {
  return (
    <PageWrapper>
      <PageHeaderSkeleton actions={2} />
      <div className="space-y-4">
        <ListToolbarSkeleton />
        <TableSkeleton columns={7} rows={6} />
      </div>
    </PageWrapper>
  );
}
