import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Inner page wrapper — caps width on large screens, gives consistent vertical
 * rhythm. Drop your page content here.
 */
export function PageWrapper({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl", className)}>{children}</div>;
}
