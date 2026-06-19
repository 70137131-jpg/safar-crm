import type { PaymentMethod, PaymentStatus } from "@prisma/client";

/**
 * Payment DTOs returned by the service. `amountPaisa` stays `bigint` and is
 * signed — refunds are negative PAID rows.
 */
export interface PaymentDTO {
  id: string;
  bookingId: string;
  amountPaisa: bigint;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  paidAt: Date | null;
  recordedById: string;
  recordedBy: { id: string; name: string } | null;
  notes: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
}

/**
 * Derived booking balance — never stored. `collectedPaisa` is the sum of PAID
 * rows (refunds reduce it); `balancePaisa = total − collected`.
 */
export interface BookingBalanceDTO {
  bookingId: string;
  totalPaisa: bigint;
  collectedPaisa: bigint;
  balancePaisa: bigint;
  fullyPaid: boolean;
}
