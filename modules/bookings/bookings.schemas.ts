import { z } from "zod";
import { fromPKR } from "@/lib/money/paisa";

// ─── Enum value lists (mirror prisma/schema.prisma) ─────────────────────────

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "TICKETED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const CANCEL_REASONS = [
  "CUSTOMER_REQUEST",
  "NO_PAYMENT",
  "SUPPLIER_ISSUE",
  "FORCE_MAJEURE",
  "OTHER",
] as const;

export type BookingStatusValue = (typeof BOOKING_STATUSES)[number];

/**
 * Allowed forward status transitions. CANCELLED is reached only via
 * `cancelBooking` (it requires a reason); COMPLETED and CANCELLED are terminal.
 */
export const BOOKING_TRANSITIONS: Record<
  BookingStatusValue,
  ReadonlyArray<BookingStatusValue>
> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["TICKETED"],
  TICKETED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

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

const requiredUuid = z.string().uuid("Invalid id");

/** PKR string ("500000" or "500000.50") → `bigint` paisa. Non-negative. */
const pricePaisaSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || /^\d+(\.\d{1,2})?$/.test(v), {
    message: "Price must be a non-negative amount",
  })
  .transform((v) => (v === undefined ? undefined : fromPKR(v)));

/** Date string → Date (travel date may be in the past for historical entry). */
const dateSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), { message: "Invalid travel date" });

const versionSchema = z.coerce.number().int().min(0);

// ─── Action schemas ──────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  customerId: requiredUuid,
  leadId: optionalUuid,
  packageId: optionalUuid,
  travelDate: dateSchema,
  totalPrice: pricePaisaSchema,
  notes: optionalText(2000),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  travelDate: dateSchema,
  totalPrice: pricePaisaSchema,
  packageId: optionalUuid,
  notes: optionalText(2000),
});
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export const changeBookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  version: versionSchema,
});
export type ChangeBookingStatusInput = z.infer<typeof changeBookingStatusSchema>;

export const cancelBookingSchema = z.object({
  version: versionSchema,
  cancelReason: z.enum(CANCEL_REASONS),
  cancelNotes: optionalText(2000),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const listBookingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(["createdAt", "travelDate", "status", "bookingNumber", "totalPricePaisa"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  includeDeleted: z.coerce.boolean().default(false),
});
export type ListBookingsInput = z.infer<typeof listBookingsSchema>;
