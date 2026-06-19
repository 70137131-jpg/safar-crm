import type { BookingStatus, CancelReason } from "@prisma/client";

/**
 * Booking DTOs returned by the service. Money stays `bigint` paisa.
 * Bookings have no `assignedAgentId` of their own — ownership flows through
 * the linked customer's `assignedAgentId` (see service ownership checks).
 */
export interface BookingCustomerSummary {
  id: string;
  name: string;
  assignedAgentId: string | null;
}

export interface BookingDTO {
  id: string;
  bookingNumber: string;
  customerId: string;
  customer: BookingCustomerSummary | null;
  leadId: string | null;
  packageId: string | null;
  travelDate: Date | null;
  status: BookingStatus;
  totalPricePaisa: bigint;
  notes: string | null;
  confirmedAt: Date | null;
  ticketedAt: Date | null;
  completedAt: Date | null;
  cancelReason: CancelReason | null;
  cancelNotes: string | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Lightweight shape for table rows. */
export interface BookingListItem {
  id: string;
  bookingNumber: string;
  customerId: string;
  customer: BookingCustomerSummary | null;
  status: BookingStatus;
  travelDate: Date | null;
  totalPricePaisa: bigint;
  version: number;
  createdAt: Date;
}

/** One row of the booking's status-transition history. */
export interface BookingStatusEventDTO {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  reason: string | null;
  byUser: { id: string; name: string } | null;
  occurredAt: Date;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
