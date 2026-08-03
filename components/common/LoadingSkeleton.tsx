import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function LoadingSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("rounded-md", className)} />;
}

/**
 * Placeholder for `<PageHeader>` — same `mb-6` row, a title block sized to the
 * `text-xl md:text-2xl` heading with the `text-sm` description under it, and an
 * optional trailing action slot.
 */
export function PageHeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Skeleton className="h-7 w-40 md:h-8" />
        <Skeleton className="mt-1 h-5 w-60" />
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Placeholder for the search + filter row that sits above every list table:
 * a `max-w-sm` search input on the left and buttons pushed to the right.
 */
export function ListToolbarSkeleton({ buttons = 2 }: { buttons?: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full max-w-sm">
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        {Array.from({ length: buttons }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full sm:w-28" />
        ))}
      </div>
    </div>
  );
}

/**
 * Loading placeholder for a list page's data, mirroring what the list clients
 * actually render once loaded: a bordered table on `md` and up, stacked cards
 * below it. `columns` is the full column count including the leading select /
 * expand column and the trailing actions column, so the placeholder cells line
 * up with the real header.
 */
export function TableSkeleton({
  columns = 5,
  rows = 6,
  leading = false,
  actions = true,
}: {
  columns?: number;
  rows?: number;
  /** Table opens with a narrow 40px checkbox / chevron column. */
  leading?: boolean;
  /** Table ends with a narrow icon-button actions column. */
  actions?: boolean;
}) {
  const dataColumns = Math.max(1, columns - (leading ? 1 : 0) - (actions ? 1 : 0));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-md border md:block">
        <div className="bg-muted flex h-10 items-center gap-4 border-b px-4">
          {leading && <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />}
          {Array.from({ length: dataColumns }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
          {actions && <div className="w-8 shrink-0" />}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            {leading && <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />}
            {Array.from({ length: dataColumns }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
            {actions && <Skeleton className="h-8 w-8 shrink-0" />}
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-6 w-2/5" />
                  <div className="mt-1 space-y-0.5">
                    <Skeleton className="h-5 w-3/5" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                </div>
                {actions && <Skeleton className="h-8 w-8 shrink-0" />}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

/**
 * Loading placeholder for the stacked-card lists that never collapse to a
 * table (customer trash, and similar single-column card lists).
 */
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-6 w-44" />
              <div className="mt-0.5 flex flex-wrap gap-x-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-32" />
              </div>
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Loading placeholder for the bordered row lists used across detail tabs and
 * panels — a title/subtitle block on the left, an amount and status on the
 * right, matching `flex items-center justify-between … rounded-lg border p-3`.
 */
export function RowListSkeleton({
  rows = 5,
  trailing = "badge",
}: {
  rows?: number;
  /** Right-hand side: an amount plus a status pill, just the amount, or nothing. */
  trailing?: "badge" | "text" | "none";
}) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
          {trailing !== "none" && (
            <div className="flex shrink-0 items-center gap-3">
              <Skeleton className="h-5 w-20" />
              {trailing === "badge" && <Skeleton className="h-[22px] w-20 rounded-full" />}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Loading placeholder for the status-history timelines on lead and booking
 * detail pages: status pills on the left, right-aligned timestamp and actor.
 */
export function TimelineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="bg-card flex items-start gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-[22px] w-20 rounded-full" />
            <Skeleton className="h-[22px] w-20 rounded-full" />
          </div>
          <div className="ml-auto">
            <Skeleton className="ml-auto h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Whole-page placeholder for a standard list route: header, filter bar, table.
 */
export function PageSkeleton() {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="space-y-4">
        <ListToolbarSkeleton />
        <TableSkeleton />
      </div>
    </div>
  );
}
