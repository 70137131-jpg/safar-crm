"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { listBookingsAction } from "@/modules/bookings/bookings.actions";
import type { BookingListItem } from "@/modules/bookings/bookings.types";
import {
  BOOKING_STATUS_META,
  formatBookingDate,
} from "../../bookings/bookingMeta";

/**
 * Bookings for a single customer, shown on the customer detail page. Reuses the
 * bookings list action with a `customerId` filter (ownership-scoped server-side).
 */
export function CustomerBookingsTab({
  customerId,
  canCreate,
}: {
  customerId: string;
  canCreate: boolean;
}) {
  const [items, setItems] = useState<BookingListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await listBookingsAction({
        customerId,
        pageSize: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (!active) return;
      if (r.ok) setItems(r.data.items);
      else toast.error(r.message);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [customerId]);

  const newHref = `/bookings/new?customerId=${customerId}` as Route;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="h-8 w-8" />}
        title="No bookings yet"
        description="Bookings linked to this customer will appear here."
        action={
          canCreate ? (
            <Button asChild>
              <Link href={newHref}>New Booking</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link href={newHref}>
              <Plus className="mr-2 h-4 w-4" />
              New Booking
            </Link>
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {items.map((b) => {
          const meta = BOOKING_STATUS_META[b.status];
          return (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}` as Route}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="font-medium">{b.bookingNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Travel: {formatBookingDate(b.travelDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">
                    {formatPKR(b.totalPricePaisa)}
                  </span>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
