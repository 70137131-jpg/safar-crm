import { z } from "zod";
import { fromPKR } from "@/lib/money/paisa";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v || undefined);

const priceSchema = z.string().trim()
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Enter a valid non-negative price")
  .transform(fromPKR);

const packageFields = {
  title: z.string().trim().min(1).max(160),
  destination: z.string().trim().min(1).max(160),
  description: optionalText(3000),
  durationDays: z.coerce.number().int().min(1).max(365),
  price: priceSchema,
  hotel: optionalText(300),
  included: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  excluded: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
};

export const createPackageSchema = z.object(packageFields);
export const updatePackageSchema = z.object({ ...packageFields, status: z.enum(["ACTIVE", "ARCHIVED"]) });
export const packageIdSchema = z.string().uuid("Invalid package id");

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
