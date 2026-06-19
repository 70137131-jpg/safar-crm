import { z } from "zod";
import { DocumentType } from "@prisma/client";

/**
 * Documents Zod schemas. One schema per server-action input.
 *
 * Note on enum: `DocumentType` is sourced from the Prisma schema
 * (PASSPORT, VISA, TICKET, INVOICE, VOUCHER, OTHER). The schema has no
 * dedicated HOTEL_VOUCHER / INSURANCE members — see the module README note.
 */

// ─── Shared field validators ─────────────────────────────────────────────────

export const documentTypeSchema = z.nativeEnum(DocumentType);

const fileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(255, "File name is too long");

/** Allowlist enforced again in the service via assertUploadConstraints(). */
const contentTypeSchema = z.string().trim().min(1, "Content type is required");

const sizeBytesSchema = z.coerce
  .number()
  .int("File size must be an integer")
  .positive("File size must be positive");

/** Lowercase hex SHA-256, matching the DB CHECK constraint `^[a-f0-9]{64}$`. */
const checksumSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/, "Invalid SHA-256 checksum");

const fileKeySchema = z
  .string()
  .trim()
  .min(1)
  .startsWith("documents/", "Invalid file key");

const customerIdSchema = z.string().uuid("Invalid customer ID");
const bookingIdSchema = z.string().uuid("Invalid booking ID");

/** Calendar date (YYYY-MM-DD) → Date, optional. */
const expiryDateSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), { message: "Invalid expiry date" });

/** At least one of customerId / bookingId must be present (schema CHECK mirror). */
function requireParent<T extends { customerId?: string; bookingId?: string }>(value: T, ctx: z.RefinementCtx) {
  if (!value.customerId && !value.bookingId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A document must be attached to a customer or a booking",
      path: ["customerId"],
    });
  }
}

// ─── Action schemas ──────────────────────────────────────────────────────────

/**
 * Step 1 of upload: client asks the server for a presigned PUT URL. No bytes
 * have moved yet. The server validates type/size/ownership before issuing it.
 */
export const createUploadUrlSchema = z
  .object({
    fileName: fileNameSchema,
    contentType: contentTypeSchema,
    sizeBytes: sizeBytesSchema,
    type: documentTypeSchema,
    customerId: customerIdSchema.optional(),
    bookingId: bookingIdSchema.optional(),
  })
  .superRefine(requireParent);
export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;

/**
 * Step 2 of upload: after the client PUTs to R2, it calls back to finalise.
 * The server HEADs the object to confirm it landed, then records the row.
 */
export const confirmUploadSchema = z
  .object({
    fileKey: fileKeySchema,
    fileName: fileNameSchema,
    contentType: contentTypeSchema,
    sizeBytes: sizeBytesSchema,
    checksumSha256: checksumSchema,
    type: documentTypeSchema,
    customerId: customerIdSchema.optional(),
    bookingId: bookingIdSchema.optional(),
    expiryDate: expiryDateSchema,
  })
  .superRefine(requireParent);
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

export const listDocumentsSchema = z
  .object({
    customerId: customerIdSchema.optional(),
    bookingId: bookingIdSchema.optional(),
  })
  .superRefine(requireParent);
export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;

export const updateDocumentSchema = z.object({
  type: documentTypeSchema.optional(),
  expiryDate: expiryDateSchema,
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
