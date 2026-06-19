import { z } from "zod";

// ─── Shared field validators ───────────────────────────────────────────────

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name is too long");

const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(254, "Email is too long")
  .toLowerCase()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

/**
 * Accepts Pakistani mobile numbers in various formats:
 *   03001234567, 0300-1234567, +923001234567, 923001234567
 * Normalisation to E.164 happens in the service layer via normalizePakistaniPhone().
 */
const phoneSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .refine(
    (v) => {
      if (!v) return true;
      const cleaned = v.replace(/[\s\-()]/g, "");
      return /^(\+?92|0)?3\d{9}$/.test(cleaned);
    },
    { message: "Invalid Pakistani phone number" },
  );

/** ISO 3166-1 alpha-2 country code. */
const nationalitySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Nationality must be a 2-letter country code")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

/** Passport: 6–12 uppercase alphanumeric characters. */
const passportNoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .refine(
    (v) => {
      if (!v) return true;
      return /^[A-Z0-9]{6,12}$/.test(v);
    },
    { message: "Passport must be 6–12 alphanumeric characters" },
  );

/** Passport expiry — string date → Date. */
const passportExpirySchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), {
    message: "Invalid passport expiry date",
  });

/** Date of birth — must not be in the future. */
const dobSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), {
    message: "Invalid date of birth",
  })
  .refine((v) => !v || v <= new Date(), {
    message: "Date of birth cannot be in the future",
  });

const addressSchema = z
  .string()
  .trim()
  .max(500, "Address is too long")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Notes must be 2000 characters or less")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const assignedAgentIdSchema = z
  .string()
  .uuid("Invalid agent ID")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

// ─── Action schemas ────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  nationality: nationalitySchema,
  passportNo: passportNoSchema,
  passportExpiry: passportExpirySchema,
  dob: dobSchema,
  address: addressSchema,
  notes: notesSchema,
  assignedAgentId: assignedAgentIdSchema,
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  nationality: nationalitySchema,
  passportNo: passportNoSchema,
  passportExpiry: passportExpirySchema,
  dob: dobSchema,
  address: addressSchema,
  notes: notesSchema,
  assignedAgentId: assignedAgentIdSchema,
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(["name", "email", "phone", "createdAt", "passportExpiry"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().trim().optional(),
  includeDeleted: z.coerce.boolean().default(false),
});
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

export const searchCustomersSchema = z.object({
  query: z.string().trim().min(1, "Search query is required").max(200),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type SearchCustomersInput = z.infer<typeof searchCustomersSchema>;

/**
 * Per-row schema for CSV/XLSX import. Lenient on optional fields;
 * strict on required name + format validations.
 */
export const importCustomerRowSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  nationality: nationalitySchema,
  passportNo: passportNoSchema,
  passportExpiry: passportExpirySchema,
  dob: dobSchema,
  address: addressSchema,
  notes: notesSchema,
});
export type ImportCustomerRow = z.infer<typeof importCustomerRowSchema>;
