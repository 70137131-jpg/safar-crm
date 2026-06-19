import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, idx) => (
          <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
            {idx > 0 && <ChevronRight className="h-3.5 w-3.5" />}
            {item.href ? (
              <Link href={item.href as Route} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
