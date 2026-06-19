import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering/numbering";
import * as customersService from "@/modules/customers/customers.service";
import * as repo from "./bookings.repository";
import {
  BOOKING_TRANSITIONS,
  type CreateBookingInput,
  type UpdateBookingInput,
  type ChangeBookingStatusInput,
  type CancelBookingInput,
  type ListBookingsInput,
} from "./bookings.schemas";
import type {
  BookingDTO,
  BookingListItem,
  BookingStatusEventDTO,
  PaginatedResult,
} from "./bookings.types";

/**
 * Bookings service — business logic, status rules, OCC, audit.
 *
 * Status rules:
 *   - Forward only: PENDING → CONFIRMED → TICKETED → COMPLETED (see
 *     BOOKING_TRANSITIONS). COMPLETED is terminal.
 *   - CANCELLED is reached only via `cancelBooking` (requires a reason) and
 *     only from a non-terminal state. Cancelling preserves all payment rows.
 *   - Status / cancel transitions use optimistic concurrency (`version`).
 *
 * Ownership: a booking has no agent column. AGENT scoping flows through the
 * linked customer's `assignedAgentId`, surfaced here as an OwnableResource.
 */

type BookingRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(r: BookingRecord): BookingDTO {
  return {
    id: r.id,
    bookingNumber: r.bookingNumber,
    customerId: r.customerId,
    customer: r.customer,
    leadId: r.leadId,
    packageId: r.packageId,
    travelDate: r.travelDate,
    status: r.status,
    totalPricePaisa: r.totalPricePaisa,
    notes: r.notes,
    confirmedAt: r.confirmedAt,
    ticketedAt: r.ticketedAt,
    completedAt: r.completedAt,
    cancelReason: r.cancelReason,
    cancelNotes: r.cancelNotes,
    cancelledAt: r.cancelledAt,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

function toListItem(r: {
  id: string;
  bookingNumber: string;
  customerId: string;
  customer: { id: string; name: string; assignedAgentId: string | null } | null;
  status: BookingDTO["status"];
  travelDate: Date | null;
  totalPricePaisa: bigint;
  version: number;
  createdAt: Date;
}): BookingListItem {
  return { ...r };
}

/** AGENT ownership token — the customer's agent owns the booking. */
function ownable(r: { customer: { assignedAgentId: string | null } | null }) {
  return { assignedAgentId: r.customer?.assignedAgentId ?? null };
}

function ownershipScope(user: UserContext): string | undefined {
  return user.role === "AGENT" ? user.id : undefined;
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getBooking(user: UserContext, id: string): Promise<BookingDTO> {
  requirePermission(user, "bookings:view");
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("Booking not found");
  if (user.role === "AGENT" && record.customer?.assignedAgentId !== user.id) {
    throw new NotFoundError("Booking not found");
  }
  return toDTO(record);
}

export async function listBookings(
  user: UserContext,
  input: ListBookingsInput,
): Promise<PaginatedResult<BookingListItem>> {
  requirePermission(user, "bookings:view");
  const includeDeleted =
    input.includeDeleted && (user.role === "ADMIN" || user.role === "MANAGER");

  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    search: input.search,
    status: input.status,
    customerId: input.customerId,
    includeDeleted,
    assignedAgentId: ownershipScope(user),
  });

  return {
    items: items.map(toListItem),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function getBookingHistory(
  user: UserContext,
  id: string,
): Promise<BookingStatusEventDTO[]> {
  await getBooking(user, id); // permission + ownership + existence
  const rows = await repo.findHistory(id);
  return rows.map((e) => ({
    id: e.id,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    reason: e.reason,
    byUser: e.byUser,
    occurredAt: e.occurredAt,
  }));
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createBooking(
  user: UserContext,
  input: CreateBookingInput,
): Promise<BookingDTO> {
  requirePermission(user, "bookings:create");

  // Existence + ownership of the target customer (service→service). For AGENT
  // this throws NotFound when the customer isn't theirs — so an agent cannot
  // create a booking against another agent's customer.
  await customersService.getCustomer(user, input.customerId);

  const totalPricePaisa = input.totalPrice ?? 0n;

  return withAudit(
    {
      ...auditContext(user),
      action: "booking.create",
      entity: "Booking",
      before: null,
      entityIdFromResult: (r: BookingDTO) => r.id,
    },
    async (tx) => {
      const bookingNumber = await nextDocumentNumber(
        "booking",
        tx,
        input.travelDate ?? new Date(),
      );
      const record = await repo.create(
        {
          bookingNumber,
          customer: { connect: { id: input.customerId } },
          ...(input.leadId ? { lead: { connect: { id: input.leadId } } } : {}),
          ...(input.packageId ? { package: { connect: { id: input.packageId } } } : {}),
          travelDate: input.travelDate ?? null,
          status: "PENDING",
          totalPricePaisa,
          notes: input.notes ?? null,
        },
        tx,
      );
      await repo.createStatusEvent(
        {
          booking: { connect: { id: record.id } },
          fromStatus: null,
          toStatus: "PENDING",
          reason: "Booking created",
          byUser: { connect: { id: user.id } },
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function updateBooking(
  user: UserContext,
  id: string,
  input: UpdateBookingInput,
): Promise<BookingDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Booking not found");
  requirePermission(user, "bookings:update", ownable(existing));

  if (existing.status === "CANCELLED") {
    throw new ValidationError("A cancelled booking cannot be edited.");
  }

  const before = toDTO(existing);
  const data: Prisma.BookingUpdateInput = {
    travelDate: input.travelDate ?? null,
    notes: input.notes ?? null,
    ...(input.totalPrice !== undefined ? { totalPricePaisa: input.totalPrice } : {}),
    package: input.packageId
      ? { connect: { id: input.packageId } }
      : { disconnect: true },
  };

  return withAudit(
    {
      ...auditContext(user),
      action: "booking.update",
      entity: "Booking",
      before,
      entityIdFromResult: (r: BookingDTO) => r.id,
    },
    async (tx) => toDTO(await repo.update(id, data, tx)),
  );
}

export async function changeStatus(
  user: UserContext,
  id: string,
  input: ChangeBookingStatusInput,
): Promise<BookingDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Booking not found");
  requirePermission(user, "bookings:update", ownable(existing));

  const target = input.status;
  if (target === "CANCELLED") {
    throw new ValidationError(
      "Use the cancel action to cancel a booking (a reason is required).",
      "status",
    );
  }
  if (!BOOKING_TRANSITIONS[existing.status].includes(target)) {
    throw new ValidationError(
      `Cannot move a ${existing.status} booking to ${target}.`,
      "status",
    );
  }

  const before = toDTO(existing);
  const now = new Date();
  const data: Prisma.BookingUpdateInput = {
    status: target,
    ...(target === "CONFIRMED" ? { confirmedAt: now } : {}),
    ...(target === "TICKETED" ? { ticketedAt: now } : {}),
    ...(target === "COMPLETED" ? { completedAt: now } : {}),
  };

  return withAudit(
    {
      ...auditContext(user),
      action: "booking.changeStatus",
      entity: "Booking",
      before,
      entityIdFromResult: (r: BookingDTO) => r.id,
    },
    async (tx) => {
      const updated = await repo.updateWithOcc(id, input.version, data, tx);
      if (!updated) {
        throw new ConflictError(
          "This booking was changed by someone else. Refresh and try again.",
        );
      }
      await repo.createStatusEvent(
        {
          booking: { connect: { id } },
          fromStatus: existing.status,
          toStatus: target,
          reason: null,
          byUser: { connect: { id: user.id } },
        },
        tx,
      );
      return toDTO(updated);
    },
  );
}

export async function cancelBooking(
  user: UserContext,
  id: string,
  input: CancelBookingInput,
): Promise<BookingDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Booking not found");
  requirePermission(user, "bookings:cancel", ownable(existing));

  if (existing.status === "CANCELLED") {
    throw new ValidationError("This booking is already cancelled.");
  }
  if (existing.status === "COMPLETED") {
    throw new ValidationError("A completed booking cannot be cancelled.");
  }

  const before = toDTO(existing);
  const data: Prisma.BookingUpdateInput = {
    status: "CANCELLED",
    cancelledAt: new Date(),
    cancelReason: input.cancelReason,
    cancelNotes: input.cancelNotes ?? null,
  };

  return withAudit(
    {
      ...auditContext(user),
      action: "booking.cancel",
      entity: "Booking",
      before,
      entityIdFromResult: (r: BookingDTO) => r.id,
    },
    async (tx) => {
      const updated = await repo.updateWithOcc(id, input.version, data, tx);
      if (!updated) {
        throw new ConflictError(
          "This booking was changed by someone else. Refresh and try again.",
        );
      }
      await repo.createStatusEvent(
        {
          booking: { connect: { id } },
          fromStatus: existing.status,
          toStatus: "CANCELLED",
          reason: input.cancelReason,
          byUser: { connect: { id: user.id } },
        },
        tx,
      );
      return toDTO(updated);
    },
  );
}
