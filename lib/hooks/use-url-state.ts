"use client";

import { useCallback } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Read and merge URL query params for list views. `set` only touches the keys
 * it's handed and preserves the rest, so a search box, a view toggle and the
 * filters can each own their own params without clobbering one another. Uses
 * `replace` (not `push`) so filtering doesn't spam history.
 *
 * Shared by the Leads views and the Audit-log viewer.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    },
    [params, pathname, router],
  );

  return { params, set };
}
