import { z } from "zod";

// ─── Enum value lists (mirror prisma/schema.prisma) ─────────────────────────

export const TASK_TYPES = ["FOLLOW_UP", "PASSPORT_EXPIRY", "PAYMENT_DUE", "OTHER"] as const;
export const TASK_STATUSES = ["OPEN", "DONE"] as const;

const optionalUuid = z
  .string()
  .uuid("Invalid id")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const dateTimeSchema = z
  .string()
  .min(1, "Due date is required")
  .transform((v) => new Date(v))
  .refine((v) => !isNaN(v.getTime()), { message: "Invalid due date" });

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    dueDate: dateTimeSchema,
    type: z.enum(TASK_TYPES).default("FOLLOW_UP"),
    leadId: optionalUuid,
    customerId: optionalUuid,
    bookingId: optionalUuid,
    assignedToId: optionalUuid,
  })
  .refine((v) => v.leadId || v.customerId || v.bookingId, {
    message: "A task must be linked to a lead, customer, or booking",
    path: ["customerId"],
  });
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  dueDate: dateTimeSchema,
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const assignTaskSchema = z.object({
  assignedToId: z.string().uuid("Invalid user id"),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export const listTasksSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(TASK_STATUSES).optional(),
  type: z.enum(TASK_TYPES).optional(),
  assignedToId: z.string().uuid().optional(),
  mine: z.coerce.boolean().default(false),
});
export type ListTasksInput = z.infer<typeof listTasksSchema>;
