"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authenticated app. Catches errors thrown by any
 * route segment under (app). Reports to Sentry and offers a retry (`reset`)
 * plus a safe way back to the dashboard.
 *
 * Note: Next.js control-flow throws (redirect/notFound) are handled by the
 * framework and never reach this boundary.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        We hit an unexpected error loading this page. You can retry, or head back to the
        dashboard.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
