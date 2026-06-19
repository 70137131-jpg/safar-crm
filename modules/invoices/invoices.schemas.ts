import { z } from "zod";
import { fromPKR } from "@/lib/money/paisa";

// ─── Enum value lists (mirror prisma/schema.prisma) ─────────────────────────

export const INVOICE_STATUSES = ["ISSUED", "PAID", "CANCELLED"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

/** Optional PKR → `bigint` paisa (defaults to the booking total when omitted). */
const optionalPaisa = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || /^\d+(\.\d{1,2})?$/.test(v), {
    message: "Amount must be a non-negative number",
  })
  .transform((v) => (v === undefined ? undefined : fromPKR(v)));

export const createInvoiceSchema = z.object({
  bookingId: z.string().uuid("Invalid booking id"),
  amount: optionalPaisa,
  notes: optionalText(2000),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const voidInvoiceSchema = z.object({
  reason: optionalText(2000),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

export const listInvoicesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(["issuedAt", "status", "amountPaisa", "invoiceNumber"]).default("issuedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(INVOICE_STATUSES).optional(),
  bookingId: z.string().uuid().optional(),
});
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;
