import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { add, sub } from "@/lib/money/paisa";
import * as bookingsService from "@/modules/bookings/bookings.service";
import * as repo from "./payments.repository";
import type {
  RecordPaymentInput,
  RefundPaymentInput,
  VoidPaymentInput,
  ListPaymentsInput,
} from "./payments.schemas";
import type { PaymentDTO, BookingBalanceDTO } from "./payments.types";

/**
 * Payments service — money is `bigint` paisa, never float.
 *
 * Model notes (mirror prisma/schema.prisma):
 *   - A payment is a signed PAID row. A refund is a NEGATIVE PAID row; the
 *     original payment is never mutated. Correcting an error VOIDs a row,
 *     excluding it from sums.
 *   - "Collected" = Σ amountPaisa over PAID rows. Balance = total − collected;
 *     it is always derived, never stored.
 *   - Overpayment guard + refund-bounds run under a booking row-lock so
 *     concurrent writes on the same booking serialise.
 *
 * Authorization:
 *   - AGENT may only record CASH payments, and only on their own bookings
 *     (ownership enforced via bookings.getBooking). AGENT has no refund/void.
 */

type PaymentRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(r: PaymentRecord): PaymentDTO {
  return {
    id: r.id,
    bookingId: r.bookingId,
    amountPaisa: r.amountPaisa,
    method: r.method,
    status: r.status,
    reference: r.reference,
    paidAt: r.paidAt,
    recordedById: r.recordedById,
    recordedBy: r.recordedBy,
    notes: r.notes,
    voidedAt: r.voidedAt,
    voidReason: r.voidReason,
    createdAt: r.createdAt,
  };
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listPayments(
  user: UserContext,
  input: ListPaymentsInput,
): Promise<PaymentDTO[]> {
  requirePermission(user, "payments:view");
  await bookingsService.getBooking(user, input.bookingId); // permission + ownership + existence
  const rows = await repo.findByBooking(input.bookingId);
  return rows.map(toDTO);
}

export async function getBookingBalance(
  user: UserContext,
  bookingId: string,
): Promise<BookingBalanceDTO> {
  requirePermission(user, "payments:view");
  const booking = await bookingsService.getBooking(user, bookingId); // ownership + total
  const collected = await repo.sumCollected(bookingId);
  const balance = sub(booking.totalPricePaisa, collected);
  return {
    bookingId,
    totalPaisa: booking.totalPricePaisa,
    collectedPaisa: collected,
    balancePaisa: balance,
    fullyPaid: balance <= 0n,
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function recordPayment(
  user: UserContext,
  input: RecordPaymentInput,
): Promise<PaymentDTO> {
  requirePermission(user, "payments:create");

  // AGENT is restricted to cash collection.
  if (user.role === "AGENT" && input.method !== "CASH") {
    throw new ForbiddenError("Agents may only record cash payments.");
  }

  // Ownership + existence (AGENT non-owned → NotFound).
  await bookingsService.getBooking(user, input.bookingId);

  // Idempotent replay: a prior payment with the same key wins (no new row).
  if (input.idempotencyKey) {
    const prior = await repo.findByIdempotencyKey(input.idempotencyKey);
    if (prior) return toDTO(prior);
  }

  return withAudit(
    {
      ...auditContext(user),
      action: "payment.record",
      entity: "Payment",
      before: null,
      entityIdFromResult: (r: PaymentDTO) => r.id,
    },
    async (tx) => {
      const booking = await repo.lockBookingForUpdate(input.bookingId, tx);
      if (!booking) throw new NotFoundError("Booking not found");
      if (booking.status === "CANCELLED") {
        throw new ValidationError(
          "Cannot record a payment on a cancelled booking. Use a refund instead.",
        );
      }

      const collected = await repo.sumCollected(input.bookingId, tx);
      const newCollected = add(collected, input.amount);
      if (newCollected > booking.totalPricePaisa) {
        throw new ValidationError(
          "Payment exceeds the outstanding balance (overpayment is not allowed).",
          "amount",
        );
      }

      const record = await repo.create(
        {
          booking: { connect: { id: input.bookingId } },
          amountPaisa: input.amount,
          method: input.method,
          status: "PAID",
          reference: input.reference ?? null,
          paidAt: input.paidAt ?? new Date(),
          recordedBy: { connect: { id: user.id } },
          idempotencyKey: input.idempotencyKey ?? null,
          notes: input.notes ?? null,
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function refundPayment(
  user: UserContext,
  input: RefundPaymentInput,
): Promise<PaymentDTO> {
  requirePermission(user, "payments:refund"); // AGENT lacks this → Forbidden

  await bookingsService.getBooking(user, input.bookingId); // ownership + existence

  if (input.idempotencyKey) {
    const prior = await repo.findByIdempotencyKey(input.idempotencyKey);
    if (prior) return toDTO(prior);
  }

  return withAudit(
    {
      ...auditContext(user),
      action: "payment.refund",
      entity: "Payment",
      before: null,
      entityIdFromResult: (r: PaymentDTO) => r.id,
    },
    async (tx) => {
      const booking = await repo.lockBookingForUpdate(input.bookingId, tx);
      if (!booking) throw new NotFoundError("Booking not found");

      const collected = await repo.sumCollected(input.bookingId, tx);
      if (input.amount > collected) {
        throw new ValidationError(
          "Refund exceeds the amount collected for this booking.",
          "amount",
        );
      }

      const record = await repo.create(
        {
          booking: { connect: { id: input.bookingId } },
          amountPaisa: -input.amount, // negative PAID row
          method: input.method,
          status: "PAID",
          paidAt: new Date(),
          recordedBy: { connect: { id: user.id } },
          idempotencyKey: input.idempotencyKey ?? null,
          notes: `Refund: ${input.reason}`,
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function voidPayment(
  user: UserContext,
  paymentId: string,
  input: VoidPaymentInput,
): Promise<PaymentDTO> {
  requirePermission(user, "payments:refund"); // privileged correction; AGENT excluded

  const existing = await repo.findById(paymentId);
  if (!existing) throw new NotFoundError("Payment not found");
  await bookingsService.getBooking(user, existing.bookingId); // ownership + existence

  if (existing.status === "VOIDED") {
    throw new ValidationError("This payment is already voided.");
  }

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "payment.void",
      entity: "Payment",
      before,
      entityIdFromResult: (r: PaymentDTO) => r.id,
    },
    async (tx) =>
      toDTO(
        await repo.voidPayment(
          paymentId,
          { voidedById: user.id, voidReason: input.voidReason },
          tx,
        ),
      ),
  );
}
