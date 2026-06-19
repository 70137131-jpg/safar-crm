import { z } from "zod";

export const INTERACTION_TYPES = [
  "CALL",
  "WHATSAPP",
  "EMAIL",
  "MEETING",
  "NOTE",
] as const;

const bodySchema = z
  .string()
  .trim()
  .min(1, "Body is required")
  .max(20000, "Body must be 20000 characters or less");

const occurredAtSchema = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .transform((v) => (v ? new Date(v) : undefined))
  .refine((v) => !v || !isNaN(v.getTime()), { message: "Invalid date" });

export const createInteractionSchema = z
  .object({
    leadId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v)),
    customerId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v === "" ? undefined : v)),
    type: z.enum(INTERACTION_TYPES),
    body: bodySchema,
    occurredAt: occurredAtSchema,
  })
  .refine((d) => Boolean(d.leadId) || Boolean(d.customerId), {
    message: "An interaction must be attached to a lead or a customer",
    path: ["leadId"],
  });
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;

export const updateInteractionSchema = z.object({
  type: z.enum(INTERACTION_TYPES).optional(),
  body: bodySchema.optional(),
  occurredAt: occurredAtSchema,
});
export type UpdateInteractionInput = z.infer<typeof updateInteractionSchema>;
