"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary — catches errors thrown in the root layout itself.
 * Must render its own <html>/<body>. Reports to Sentry, offers a reset.
 */
export default function GlobalError({
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
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
