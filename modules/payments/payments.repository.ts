import type { Prisma, BookingStatus } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Payments repository — pure data access.
 *
 *   - No business logic, no audit.
 *   - Payments are never soft-deleted; correcting an error means VOIDing the
 *     row (status = VOIDED), which excludes it from `sumCollected`.
 *   - `lockBookingForUpdate` + `sumCollected` are used together inside one
 *     transaction so concurrent payments on the same booking serialise and
 *     cannot race past the overpayment guard.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE_RECORDER = {
  recordedBy: { select: { id: true, name: true } },
} as const;

export async function findById(id: string, tx: TxClient = db) {
  return tx.payment.findUnique({ where: { id }, include: INCLUDE_RECORDER });
}

export async function findByBooking(bookingId: string) {
  return db.payment.findMany({
    where: { bookingId },
    include: INCLUDE_RECORDER,
    orderBy: { createdAt: "desc" },
  });
}

export async function findByIdempotencyKey(key: string, tx: TxClient = db) {
  return tx.payment.findFirst({ where: { idempotencyKey: key }, include: INCLUDE_RECORDER });
}

/** Sum of PAID amounts (signed; refunds are negative). VOIDED rows excluded. */
export async function sumCollected(bookingId: string, tx: TxClient = db): Promise<bigint> {
  const agg = await tx.payment.aggregate({
    where: { bookingId, status: "PAID" },
    _sum: { amountPaisa: true },
  });
  return agg._sum.amountPaisa ?? 0n;
}

/**
 * Row-lock the booking and return its price + status. `null` if it doesn't
 * exist (or is soft-deleted). Must run inside a transaction; the lock is held
 * until commit, serialising payment writes against the same booking.
 */
export async function lockBookingForUpdate(
  bookingId: string,
  tx: Prisma.TransactionClient,
): Promise<{ totalPricePaisa: bigint; status: BookingStatus } | null> {
  const rows = await tx.$queryRaw<{ totalPricePaisa: bigint; status: BookingStatus }[]>`
    SELECT "totalPricePaisa", status FROM "Booking"
    WHERE id = ${bookingId}::uuid AND "deletedAt" IS NULL
    FOR UPDATE`;
  return rows[0] ?? null;
}

export async function create(data: Prisma.PaymentCreateInput, tx: TxClient = db) {
  return tx.payment.create({ data, include: INCLUDE_RECORDER });
}

export async function voidPayment(
  id: string,
  data: { voidedById: string; voidReason: string },
  tx: TxClient = db,
) {
  return tx.payment.update({
    where: { id },
    data: {
      status: "VOIDED",
      voidedAt: new Date(),
      voidedById: data.voidedById,
      voidReason: data.voidReason,
    },
    include: INCLUDE_RECORDER,
  });
}
