import { z } from "zod";
import { fromPKR } from "@/lib/money/paisa";

// ─── Enum value lists (mirror prisma/schema.prisma) ─────────────────────────

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] as const;
export const PAYMENT_STATUSES = ["PAID", "VOIDED"] as const;

// ─── Field validators ───────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

/** PKR string → positive `bigint` paisa (amount must be > 0). */
const positiveAmountPaisa = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), { message: "Amount must be a positive number" })
  .transform((v) => fromPKR(v))
  .refine((v) => v > 0n, { message: "Amount must be greater than zero" });

const dateSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), { message: "Invalid date" });

// ─── Action schemas ──────────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  bookingId: z.string().uuid("Invalid booking id"),
  amount: positiveAmountPaisa,
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(200),
  paidAt: dateSchema,
  idempotencyKey: optionalText(100),
  notes: optionalText(2000),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const refundPaymentSchema = z.object({
  bookingId: z.string().uuid("Invalid booking id"),
  amount: positiveAmountPaisa, // magnitude; stored as a negative PAID row
  method: z.enum(PAYMENT_METHODS),
  reason: z.string().trim().min(1, "A refund reason is required").max(2000),
  idempotencyKey: optionalText(100),
});
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;

export const voidPaymentSchema = z.object({
  voidReason: z.string().trim().min(1, "A reason is required").max(2000),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const listPaymentsSchema = z.object({
  bookingId: z.string().uuid("Invalid booking id"),
});
export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;
