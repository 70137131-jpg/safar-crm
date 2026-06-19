import { z } from "zod";
import { ROLES } from "@/lib/permissions";

/**
 * Users Zod schemas. One schema per server-action input.
 * Role values come from the permissions catalog (single source of truth).
 */

export const roleSchema = z.enum(ROLES);

const nameSchema = z.string().trim().min(1, "Name is required").max(200, "Name is too long");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(254, "Email is too long");

/** Strong password: ≥12 chars with upper, lower, digit and symbol. */
export const strongPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200, "Password is too long")
  .regex(/[a-z]/, "Must include a lowercase letter")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[0-9]/, "Must include a digit")
  .regex(/[^A-Za-z0-9]/, "Must include a special character");

const avatarSchema = z
  .string()
  .trim()
  .url("Avatar must be a valid URL")
  .max(2048)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

// ─── Action schemas ──────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  temporaryPassword: strongPasswordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: nameSchema,
  avatar: avatarSchema,
  role: roleSchema,
  isActive: z.boolean(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changeRoleSchema = z.object({ role: roleSchema });
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const resetPasswordSchema = z.object({ newPassword: strongPasswordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  role: roleSchema.optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});
export type ListUsersInput = z.infer<typeof listUsersSchema>;

// ─── Self-service (profile) ──────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: nameSchema,
  avatar: avatarSchema,
  email: emailSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPasswordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
