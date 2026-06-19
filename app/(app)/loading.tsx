import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/**
 * Default route-level loading fallback for the authenticated app. Shown during
 * server navigation between (app) segments. Individual pages may still use
 * their own <Suspense> boundaries for finer-grained streaming (e.g. dashboard).
 */
export default function AppLoading() {
  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <LoadingSkeleton className="h-6 w-48" />
        <LoadingSkeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <LoadingSkeleton className="h-64 w-full" />
    </div>
  );
}
