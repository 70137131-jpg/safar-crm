import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("rounded-md", className)} />;
}

/**
 * Loading placeholder shaped like a data table — a header row plus body rows
 * with one cell per column, so the skeleton mirrors the real content.
 */
export function TableSkeleton({
  columns = 5,
  rows = 6,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
