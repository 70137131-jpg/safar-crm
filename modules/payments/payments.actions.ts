"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  recordPaymentSchema,
  refundPaymentSchema,
  voidPaymentSchema,
  listPaymentsSchema,
} from "./payments.schemas";
import type { PaymentDTO, BookingBalanceDTO } from "./payments.types";
import * as service from "./payments.service";

/**
 * Payments server actions.
 *
 * Every action: requireUser() → Zod parse → service (requirePermission) →
 * typed ActionResult.
 */

export const recordPaymentAction = serverAction(
  "payments.record",
  async (formData: Record<string, unknown>): Promise<PaymentDTO> => {
    const user = await requireUser();
    const input = recordPaymentSchema.parse(formData);
    return service.recordPayment(user, input);
  },
);

export const refundPaymentAction = serverAction(
  "payments.refund",
  async (formData: Record<string, unknown>): Promise<PaymentDTO> => {
    const user = await requireUser();
    const input = refundPaymentSchema.parse(formData);
    return service.refundPayment(user, input);
  },
);

export const voidPaymentAction = serverAction(
  "payments.void",
  async (paymentId: string, formData: Record<string, unknown>): Promise<PaymentDTO> => {
    const user = await requireUser();
    const input = voidPaymentSchema.parse(formData);
    return service.voidPayment(user, paymentId, input);
  },
);

export const listPaymentsAction = serverAction(
  "payments.list",
  async (params: Record<string, unknown>): Promise<PaymentDTO[]> => {
    const user = await requireUser();
    const input = listPaymentsSchema.parse(params);
    return service.listPayments(user, input);
  },
);

export const getBookingBalanceAction = serverAction(
  "payments.balance",
  async (bookingId: string): Promise<BookingBalanceDTO> => {
    const user = await requireUser();
    return service.getBookingBalance(user, bookingId);
  },
);
