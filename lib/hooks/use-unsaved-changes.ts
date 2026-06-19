"use client";

import { useEffect } from "react";

/**
 * Warns the user with the native browser prompt before unloading the page —
 * refresh, tab close, or navigation to an external URL — while `when` is true
 * (e.g. a form has unsaved changes).
 *
 * Note: Next.js App Router client-side <Link> navigations do not fire the
 * `beforeunload` event, so this guards the data-loss cases the browser exposes
 * (reload / close / back-forward to a different document).
 */
export function useUnsavedChangesWarning(when: boolean) {
  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
