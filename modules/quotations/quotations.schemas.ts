import { z } from "zod";
import { fromPKR } from "@/lib/money/paisa";

// ─── Enum value lists (mirror prisma/schema.prisma) ─────────────────────────

export const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "EXPIRED"] as const;
export type QuotationStatusValue = (typeof QUOTATION_STATUSES)[number];

// ─── Field validators ───────────────────────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

const optionalUuid = z
  .string()
  .uuid("Invalid id")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

/** Non-negative PKR → `bigint` paisa. */
const nonNegativePaisa = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" || v === undefined ? "0" : v))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), { message: "Must be a non-negative amount" })
  .transform((v) => fromPKR(v));

const dateSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), { message: "Invalid date" });

const versionSchema = z.coerce.number().int().min(0);

export const quotationItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  quantity: z.coerce.number().int().min(1, "Qty ≥ 1").max(9999),
  unitPrice: z
    .string()
    .trim()
    .min(1, "Unit price is required")
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), { message: "Unit price must be a non-negative amount" })
    .transform((v) => fromPKR(v)),
});
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

// ─── Action schemas ──────────────────────────────────────────────────────────

const quotationBody = {
  customerId: optionalUuid,
  leadId: optionalUuid,
  validTill: dateSchema,
  discount: nonNegativePaisa,
  notes: optionalText(2000),
  items: z.array(quotationItemSchema).min(1, "Add at least one line item").max(100),
};

export const createQuotationSchema = z
  .object(quotationBody)
  .refine((v) => v.customerId || v.leadId, {
    message: "A quotation must be linked to a customer or a lead",
    path: ["customerId"],
  });
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z
  .object({ ...quotationBody, version: versionSchema })
  .refine((v) => v.customerId || v.leadId, {
    message: "A quotation must be linked to a customer or a lead",
    path: ["customerId"],
  });
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const sendQuotationSchema = z.object({ version: versionSchema });
export type SendQuotationInput = z.infer<typeof sendQuotationSchema>;

export const acceptQuotationSchema = z.object({ version: versionSchema });
export type AcceptQuotationInput = z.infer<typeof acceptQuotationSchema>;

export const listQuotationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(["createdAt", "validTill", "status", "totalPaisa", "quoteNumber"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().optional(),
  status: z.enum(QUOTATION_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
});
export type ListQuotationsInput = z.infer<typeof listQuotationsSchema>;
