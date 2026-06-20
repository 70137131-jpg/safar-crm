import type { BookingStatus, CancelReason } from "@prisma/client";
import type { StatusTone } from "@/components/common/StatusBadge";

/**
 * Client-safe presentation metadata + helpers shared by the bookings list,
 * detail, and form views. No server imports — safe in client components.
 *
 * Mirrors the status rules enforced in `bookings.service.ts`:
 *   - Forward only: PENDING → CONFIRMED → TICKETED → COMPLETED.
 *   - CANCELLED is reached only via the cancel action (requires a reason) and
 *     only from a non-terminal, non-completed state.
 */

export const BOOKING_STATUS_ORDER: readonly BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "TICKETED",
  "COMPLETED",
  "CANCELLED",
];

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; tone: StatusTone }
> = {
  PENDING: { label: "Pending", tone: "neutral" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  TICKETED: { label: "Ticketed", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

/**
 * The single forward transition offered as a primary action on the detail
 * page. `null` means the booking is terminal (COMPLETED / CANCELLED).
 */
export const BOOKING_ADVANCE_ACTION: Record<
  BookingStatus,
  { to: BookingStatus; label: string } | null
> = {
  PENDING: { to: "CONFIRMED", label: "Confirm Booking" },
  CONFIRMED: { to: "TICKETED", label: "Mark Ticketed" },
  TICKETED: { to: "COMPLETED", label: "Mark Completed" },
  COMPLETED: null,
  CANCELLED: null,
};

export const CANCEL_REASON_OPTIONS = [
  { value: "CUSTOMER_REQUEST", label: "Customer request" },
  { value: "NO_PAYMENT", label: "No payment" },
  { value: "SUPPLIER_ISSUE", label: "Supplier issue" },
  { value: "FORCE_MAJEURE", label: "Force majeure" },
  { value: "OTHER", label: "Other" },
] as const satisfies readonly { value: CancelReason; label: string }[];

export function cancelReasonLabel(value: CancelReason | null | undefined): string {
  if (!value) return "—";
  return CANCEL_REASON_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function formatBookingDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

export function formatBookingDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0] ?? "";
}
