import { z } from "zod";
import { fromPKR } from "@/lib/money/paisa";
import { pktDateString } from "@/lib/time/tz";

// ─── Enum value lists (mirror prisma/schema.prisma) ─────────────────────────

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUOTATION_SENT",
  "NEGOTIATING",
  "BOOKED",
  "TRAVELLED",
  "LOST",
] as const;

export const TRIP_PURPOSES = [
  "UMRAH",
  "HAJJ",
  "LEISURE_TOUR",
  "BUSINESS",
  "FAMILY_VISIT",
  "EDUCATION",
  "MEDICAL",
  "OTHER",
] as const;

export const ROUTE_SHAPES = ["ONE_WAY", "ROUND_TRIP", "MULTI_CITY"] as const;

export const LOST_REASONS = [
  "PRICE",
  "COMPETITOR",
  "NO_RESPONSE",
  "CHANGED_PLANS",
  "NO_VISA",
  "OTHER",
] as const;

// ─── Field validators ───────────────────────────────────────────────────────

const contactNameSchema = z
  .string()
  .trim()
  .min(1, "Contact name is required")
  .max(200, "Name is too long");

/** Required Pakistani mobile; normalised to E.164 in the service. */
const contactPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .refine(
    (v) => /^(\+?92|0)?3\d{9}$/.test(v.replace(/[\s\-()]/g, "")),
    "Invalid Pakistani phone number",
  );

const contactEmailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(254)
  .toLowerCase()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

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

const paxSchema = z
  .union([z.string(), z.number()])
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isInteger(v) && v > 0 && v <= 999), {
    message: "Pax must be a whole number between 1 and 999",
  });

/** PKR string (e.g. "500000" or "500000.50") → `bigint` paisa, or undefined. */
const budgetSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || /^\d+(\.\d{1,2})?$/.test(v), {
    message: "Budget must be a non-negative amount",
  })
  .transform((v) => (v === undefined ? undefined : fromPKR(v)));

/** Date string → Date; must be today (PKT) or later. */
const futureDateSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), { message: "Invalid travel date" })
  .refine((v) => !v || pktDateString(v) >= pktDateString(new Date()), {
    message: "Travel date must be today or in the future",
  });

const versionSchema = z.coerce.number().int().min(0);

// ─── Action schemas ──────────────────────────────────────────────────────────

const leadFields = {
  contactName: contactNameSchema,
  contactPhone: contactPhoneSchema,
  contactEmail: contactEmailSchema,
  customerId: optionalUuid,
  source: optionalText(100),
  destination: optionalText(200),
  tripPurpose: z.enum(TRIP_PURPOSES).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  routeShape: z.enum(ROUTE_SHAPES).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  pax: paxSchema,
  budget: budgetSchema,
  travelDate: futureDateSchema,
  assignedAgentId: optionalUuid,
};

export const createLeadSchema = z.object(leadFields);
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object(leadFields);
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const listLeadsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(["createdAt", "travelDate", "status", "contactName", "budgetPaisa"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedAgentId: z.string().uuid().optional(),
  source: z.string().trim().optional(),
  includeDeleted: z.coerce.boolean().default(false),
});
export type ListLeadsInput = z.infer<typeof listLeadsSchema>;

export const kanbanLeadsSchema = z.object({
  search: z.string().trim().optional(),
  assignedAgentId: z.string().uuid().optional(),
});
export type KanbanLeadsInput = z.infer<typeof kanbanLeadsSchema>;

export const changeLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  version: versionSchema,
  lostReason: z.enum(LOST_REASONS).optional(),
  lostNotes: optionalText(2000),
});
export type ChangeLeadStatusInput = z.infer<typeof changeLeadStatusSchema>;

export const assignLeadSchema = z.object({
  assignedAgentId: z.string().uuid("Invalid agent id"),
  version: versionSchema,
});
export type AssignLeadInput = z.infer<typeof assignLeadSchema>;

export const convertLeadSchema = z.object({
  version: versionSchema,
  totalPrice: budgetSchema, // PKR → paisa; defaults to the lead's budget
});
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
