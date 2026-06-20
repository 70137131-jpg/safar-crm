"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { listCustomersAction } from "@/modules/customers/customers.actions";
import type { CustomerListItem } from "@/modules/customers/customers.types";

export interface PickedCustomer {
  id: string;
  name: string;
}

/**
 * Async customer picker for the create-booking form. Debounced search hits
 * `listCustomersAction` (which is itself ownership-scoped for AGENTs, so an
 * agent can only ever pick their own customers). Once a customer is chosen the
 * field collapses to a chip with a clear button.
 */
export function CustomerCombobox({
  value,
  onChange,
  disabled,
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    const r = await listCustomersAction({
      page: 1,
      pageSize: 8,
      search: q,
      sortBy: "name",
      sortOrder: "asc",
    });
    if (r.ok) setResults(r.data.items);
    setLoading(false);
  }, []);

  // Debounce searches. When the query is empty the dropdown is hidden anyway
  // (see the render guard), so there's nothing to reset here.
  useEffect(() => {
    if (value) return;
    const q = query.trim();
    if (q.length < 1) return;
    const timer = setTimeout(() => void runSearch(q), 250);
    return () => clearTimeout(timer);
  }, [query, value, runSearch]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">{value.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear selected customer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers by name, phone, email…"
          className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {open && query.trim().length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No customers found.
            </div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange({ id: c.id, name: c.name });
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full flex-col items-start rounded-sm px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
              >
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
