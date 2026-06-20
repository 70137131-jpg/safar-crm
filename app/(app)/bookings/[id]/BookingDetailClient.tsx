"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil,
  CalendarDays,
  Wallet,
  User as UserIcon,
  Hash,
  Info,
  History,
  Ban,
  ArrowRight,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import type { CancelReason } from "@prisma/client";
import { cn } from "@/lib/cn";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  changeBookingStatusAction,
  cancelBookingAction,
  getBookingAction,
  getBookingHistoryAction,
} from "@/modules/bookings/bookings.actions";
import type {
  BookingDTO,
  BookingStatusEventDTO,
} from "@/modules/bookings/bookings.types";
import { CreateTaskDialog } from "../../tasks/CreateTaskDialog";
import { PaymentsPanel, type PaymentCaps } from "./PaymentsPanel";
import {
  BOOKING_STATUS_META,
  BOOKING_ADVANCE_ACTION,
  CANCEL_REASON_OPTIONS,
  cancelReasonLabel,
  formatBookingDate,
  formatBookingDateTime,
} from "../bookingMeta";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const textareaCls =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TABS = [
  { id: "overview", label: "Overview", icon: Info },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "history", label: "History", icon: History },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | undefined): v is TabId {
  return v === "overview" || v === "payments" || v === "history";
}

export function BookingDetailClient({
  booking: initial,
  caps,
  paymentCaps,
  initialTab,
}: {
  booking: BookingDTO;
  caps: {
    canUpdate: boolean;
    canCancel: boolean;
    canCreateTask: boolean;
    canAssignTask: boolean;
  };
  paymentCaps: PaymentCaps;
  initialTab?: string;
}) {
  const router = useRouter();
  // Local source of truth: seeded from the server prop and updated optimistically
  // from each action's returned DTO. The detail page remounts this component via
  // `key={booking.id}`, so navigating between bookings re-seeds it correctly.
  const [booking, setBooking] = useState<BookingDTO>(initial);
  const [activeTab, setActiveTab] = useState<TabId>(
    isTabId(initialTab) ? initialTab : "overview",
  );
  const [cancelOpen, setCancelOpen] = useState(false);

  const refetch = useCallback(async () => {
    const r = await getBookingAction(booking.id);
    if (r.ok) setBooking(r.data);
  }, [booking.id]);

  const meta = BOOKING_STATUS_META[booking.status];
  const advance = BOOKING_ADVANCE_ACTION[booking.status];
  const isTerminal = booking.status === "CANCELLED" || booking.status === "COMPLETED";
  const isCancelled = booking.status === "CANCELLED";

  async function handleAdvance() {
    if (!advance) return;
    const result = await changeBookingStatusAction(booking.id, {
      status: advance.to,
      version: booking.version,
    });
    if (result.ok) {
      setBooking(result.data);
      toast.success(`Booking marked ${BOOKING_STATUS_META[advance.to].label}`);
      router.refresh();
    } else {
      toast.error(result.message);
      if (result.code === "CONFLICT") await refetch();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Hash className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{booking.bookingNumber}</h2>
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {booking.customer ? (
                  <Link
                    href={`/customers/${booking.customer.id}` as Route}
                    className="hover:underline"
                  >
                    {booking.customer.name}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {caps.canCreateTask && (
              <CreateTaskDialog
                canAssign={caps.canAssignTask}
                bookingId={booking.id}
                contextLabel={`Booking ${booking.bookingNumber}${
                  booking.customer ? ` · ${booking.customer.name}` : ""
                }`}
                trigger={(open) => (
                  <Button variant="outline" onClick={open}>
                    <ListChecks className="mr-2 h-4 w-4" />
                    New Task
                  </Button>
                )}
              />
            )}
            {caps.canUpdate && !isCancelled && (
              <Link
                href={`/bookings/${booking.id}/edit` as Route}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            )}
            {caps.canUpdate && advance && (
              <ConfirmDialog
                title={advance.label + "?"}
                description={`This moves the booking from ${meta.label} to ${BOOKING_STATUS_META[advance.to].label}.`}
                confirmLabel={advance.label}
                onConfirm={handleAdvance}
                trigger={(open) => (
                  <Button onClick={open}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    {advance.label}
                  </Button>
                )}
              />
            )}
            {caps.canCancel && !isTerminal && (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            icon={<UserIcon className="h-4 w-4" />}
            label="Customer"
            value={booking.customer?.name}
          />
          <Field
            icon={<Wallet className="h-4 w-4" />}
            label="Total Price"
            value={formatPKR(booking.totalPricePaisa)}
          />
          <Field
            icon={<CalendarDays className="h-4 w-4" />}
            label="Travel Date"
            value={formatBookingDate(booking.travelDate)}
          />
        </div>
      </div>

      {/* Cancellation banner */}
      {isCancelled && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Ban className="h-4 w-4" />
            Cancelled {booking.cancelledAt ? formatBookingDateTime(booking.cancelledAt) : ""}
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Reason:</dt>
              <dd>{cancelReasonLabel(booking.cancelReason)}</dd>
            </div>
            {booking.cancelNotes && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Notes:</dt>
                <dd className="whitespace-pre-wrap">{booking.cancelNotes}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="-mb-px flex gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-h-[160px]">
        {activeTab === "overview" && <Overview booking={booking} />}
        {activeTab === "payments" && (
          <PaymentsPanel
            bookingId={booking.id}
            bookingStatus={booking.status}
            caps={paymentCaps}
          />
        )}
        {activeTab === "history" && <HistoryTab bookingId={booking.id} />}
      </div>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        bookingNumber={booking.bookingNumber}
        onCancelled={(updated) => {
          setBooking(updated);
          setCancelOpen(false);
          toast.success("Booking cancelled");
          router.refresh();
        }}
        onConflict={async () => {
          setCancelOpen(false);
          await refetch();
        }}
        bookingId={booking.id}
        version={booking.version}
      />
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ booking }: { booking: BookingDTO }) {
  return (
    <div className="space-y-4 text-sm">
      {booking.notes ? (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Notes</h3>
          <p className="whitespace-pre-wrap">{booking.notes}</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Confirmed" value={formatBookingDateTime(booking.confirmedAt)} />
        <Field label="Ticketed" value={formatBookingDateTime(booking.ticketedAt)} />
        <Field label="Completed" value={formatBookingDateTime(booking.completedAt)} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Created {formatBookingDateTime(booking.createdAt)}</span>
        <span>Updated {formatBookingDateTime(booking.updatedAt)}</span>
      </div>
    </div>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

function HistoryTab({ bookingId }: { bookingId: string }) {
  const [items, setItems] = useState<BookingStatusEventDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await getBookingHistoryAction(bookingId);
      if (!active) return;
      if (r.ok) setItems(r.data);
      else toast.error(r.message);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [bookingId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-8 w-8" />}
        title="No status changes yet"
        description="Status transitions will be recorded here."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((ev) => {
        const toMeta = BOOKING_STATUS_META[ev.toStatus];
        const fromMeta = ev.fromStatus ? BOOKING_STATUS_META[ev.fromStatus] : null;
        return (
          <li
            key={ev.id}
            className="flex items-start gap-3 rounded-lg border bg-card p-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {fromMeta && (
                <>
                  <StatusBadge tone={fromMeta.tone}>{fromMeta.label}</StatusBadge>
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <StatusBadge tone={toMeta.tone}>{toMeta.label}</StatusBadge>
            </div>
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <div>{formatBookingDateTime(ev.occurredAt)}</div>
              {ev.byUser && <div>{ev.byUser.name}</div>}
              {ev.reason && <div className="italic">{ev.reason}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Cancel dialog ────────────────────────────────────────────────────────────

function CancelDialog({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  version,
  onCancelled,
  onConflict,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  bookingNumber: string;
  version: number;
  onCancelled: (updated: BookingDTO) => void;
  onConflict: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState<CancelReason>("CUSTOMER_REQUEST");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const result = await cancelBookingAction(bookingId, {
        version,
        cancelReason: reason,
        cancelNotes: notes,
      });
      if (result.ok) {
        onCancelled(result.data);
      } else {
        toast.error(result.message);
        if (result.code === "CONFLICT") await onConflict();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel booking {bookingNumber}?</DialogTitle>
          <DialogDescription>
            The booking is marked cancelled. Existing payment records are kept
            for the audit trail — they are not deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Reason <span className="text-destructive">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as CancelReason)}
              className={selectCls}
            >
              {CANCEL_REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={textareaCls}
              placeholder="Optional detail about the cancellation…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Keep Booking
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Cancelling…" : "Cancel Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
