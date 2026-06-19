"use client";

import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export function SearchInput({
  className,
  "aria-label": ariaLabel,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={ariaLabel ?? (typeof rest.placeholder === "string" ? rest.placeholder : "Search")}
        className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...rest}
      />
    </div>
  );
}
