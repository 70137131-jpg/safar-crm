"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatPKR } from "@/lib/money/paisa";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { listBookingsAction } from "@/modules/bookings/bookings.actions";
import type { BookingListItem } from "@/modules/bookings/bookings.types";
import {
  BOOKING_STATUS_META,
  formatBookingDate,
} from "../bookings/bookingMeta";

/**
 * Payments are recorded against a booking, so this is a finder: search a
 * booking, then jump straight to its Payments tab. Results are ownership-scoped
 * server-side (an AGENT only sees their own bookings).
 */
export function PaymentsFinderClient() {
  const [items, setItems] = useState<BookingListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const r = await listBookingsAction({
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
      search: search || undefined,
    });
    if (r.ok) setItems(r.data.items);
    else toast.error(r.message);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <SearchInput
          placeholder="Find a booking by # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No bookings found"
          description={
            search
              ? "Try a different search term."
              : "Bookings will appear here once created."
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((b) => {
            const meta = BOOKING_STATUS_META[b.status];
            return (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}?tab=payments` as Route}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{b.bookingNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.customer?.name ?? "—"} · Travel:{" "}
                      {formatBookingDate(b.travelDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums">
                      {formatPKR(b.totalPricePaisa)}
                    </span>
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
