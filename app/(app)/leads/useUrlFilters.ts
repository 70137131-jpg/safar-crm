"use client";

// The implementation now lives in a shared hook so the Audit-log viewer can
// reuse it. Kept here as a re-export to avoid churning the leads imports.
export { useUrlState } from "@/lib/hooks/use-url-state";
