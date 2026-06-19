import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission, can } from "@/lib/permissions";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { enqueueEmail } from "@/lib/email/outbox";
import { getNotificationConfig } from "@/modules/settings/settings.service";
import * as repo from "./tasks.repository";
import type { CreateTaskInput, UpdateTaskInput, AssignTaskInput, ListTasksInput } from "./tasks.schemas";
import type { TaskDTO, TaskListItem, PaginatedResult } from "./tasks.types";

/**
 * Tasks service — follow-ups, reminders, and the cron-driven sweeps.
 *
 *   - AGENT scoping is by `assignedToId` (their own tasks).
 *   - Sweeps are SYSTEM jobs (no user) and idempotent: task creation relies on
 *     the partial unique indexes; reminder emails are claimed via
 *     `reminderSentAt`, so a Vercel Cron double-fire sends exactly one email.
 */

type TaskRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(r: TaskRecord): TaskDTO {
  return {
    id: r.id,
    title: r.title,
    dueDate: r.dueDate,
    status: r.status,
    type: r.type,
    leadId: r.leadId,
    customerId: r.customerId,
    bookingId: r.bookingId,
    assignedToId: r.assignedToId,
    assignedTo: r.assignedTo,
    doneAt: r.doneAt,
    createdAt: r.createdAt,
  };
}

/** AGENT ownership token — the assignee owns the task. */
function ownable(r: { assignedToId: string }) {
  return { assignedAgentId: r.assignedToId };
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getTask(user: UserContext, id: string): Promise<TaskDTO> {
  requirePermission(user, "tasks:view");
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("Task not found");
  if (user.role === "AGENT" && record.assignedToId !== user.id) {
    throw new NotFoundError("Task not found");
  }
  return toDTO(record);
}

export async function listTasks(
  user: UserContext,
  input: ListTasksInput,
): Promise<PaginatedResult<TaskListItem>> {
  requirePermission(user, "tasks:view");
  // AGENTs only ever see their own tasks; others may filter to "mine".
  const assignedToId =
    user.role === "AGENT" ? user.id : input.mine ? user.id : input.assignedToId;

  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    status: input.status,
    type: input.type,
    assignedToId,
  });

  return {
    items: items.map((r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.dueDate,
      status: r.status,
      type: r.type,
      assignedToId: r.assignedToId,
      assignedTo: r.assignedTo,
      customerId: r.customerId,
      bookingId: r.bookingId,
      leadId: r.leadId,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createTask(user: UserContext, input: CreateTaskInput): Promise<TaskDTO> {
  requirePermission(user, "tasks:create");

  // Only users with tasks:assign may target another user; everyone else (AGENT)
  // creates tasks for themselves.
  const assignedToId =
    can(user, "tasks:assign") && input.assignedToId ? input.assignedToId : user.id;

  const data: Prisma.TaskCreateInput = {
    title: input.title,
    dueDate: input.dueDate,
    type: input.type,
    assignedTo: { connect: { id: assignedToId } },
    ...(input.leadId ? { lead: { connect: { id: input.leadId } } } : {}),
    ...(input.customerId ? { customer: { connect: { id: input.customerId } } } : {}),
    ...(input.bookingId ? { booking: { connect: { id: input.bookingId } } } : {}),
  };

  return withAudit(
    {
      ...auditContext(user),
      action: "task.create",
      entity: "Task",
      before: null,
      entityIdFromResult: (r: TaskDTO) => r.id,
    },
    async (tx) => toDTO(await repo.create(data, tx)),
  );
}

export async function updateTask(
  user: UserContext,
  id: string,
  input: UpdateTaskInput,
): Promise<TaskDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Task not found");
  requirePermission(user, "tasks:update", ownable(existing));
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "task.update",
      entity: "Task",
      before,
      entityIdFromResult: (r: TaskDTO) => r.id,
    },
    async (tx) => toDTO(await repo.update(id, { title: input.title, dueDate: input.dueDate }, tx)),
  );
}

export async function completeTask(user: UserContext, id: string): Promise<TaskDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Task not found");
  requirePermission(user, "tasks:update", ownable(existing));
  if (existing.status === "DONE") {
    throw new ValidationError("This task is already done.");
  }
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "task.complete",
      entity: "Task",
      before,
      entityIdFromResult: (r: TaskDTO) => r.id,
    },
    async (tx) =>
      toDTO(await repo.update(id, { status: "DONE", doneAt: new Date(), doneById: user.id }, tx)),
  );
}

export async function assignTask(
  user: UserContext,
  id: string,
  input: AssignTaskInput,
): Promise<TaskDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Task not found");
  requirePermission(user, "tasks:assign");
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "task.assign",
      entity: "Task",
      before,
      entityIdFromResult: (r: TaskDTO) => r.id,
    },
    async (tx) =>
      toDTO(await repo.update(id, { assignedTo: { connect: { id: input.assignedToId } } }, tx)),
  );
}

// ─── Cron sweeps (SYSTEM — no user) ─────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Email reminders for due OPEN tasks. Idempotent via `reminderSentAt` claim. */
export async function sweepReminders(): Promise<{ processed: number; reminded: number }> {
  const config = await getNotificationConfig();
  if (!config.notifyOverdueTasks) return { processed: 0, reminded: 0 };

  const now = new Date();
  const due = await repo.findDueForReminder(now);
  let reminded = 0;

  for (const task of due) {
    const ok = await db.$transaction(async (tx) => {
      const claimed = await repo.claimReminder(task.id, now, tx);
      if (!claimed) return false; // already reminded (or a concurrent run won)
      if (task.assignedTo?.email) {
        await enqueueEmail(tx, {
          toEmail: task.assignedTo.email,
          subject: `Task due: ${task.title}`,
          bodyHtml: `<p>Hi ${task.assignedTo.name},</p><p>Your task <strong>${task.title}</strong> was due on ${task.dueDate.toISOString().slice(0, 10)}.</p>`,
          relatedType: "Task",
          relatedId: task.id,
        });
      }
      return true;
    });
    if (ok) reminded++;
  }

  logger.info({ processed: due.length, reminded }, "tasks.sweep_reminders");
  return { processed: due.length, reminded };
}

/** Create PASSPORT_EXPIRY tasks for customers with passports expiring soon. */
export async function sweepPassportExpiry(): Promise<{ created: number }> {
  const config = await getNotificationConfig();
  if (!config.notifyPassportExpiry) return { created: 0 };

  const now = new Date();
  const windowEnd = new Date(now.getTime() + config.passportExpiryWarnDays * MS_PER_DAY);
  const candidates = await repo.findPassportExpiryCandidates(now, windowEnd);

  const data: Prisma.TaskCreateManyInput[] = candidates
    .filter((c) => c.assignedAgentId && c.passportExpiry)
    .map((c) => ({
      title: `Passport expiring soon — ${c.name}`,
      dueDate: c.passportExpiry!,
      type: "PASSPORT_EXPIRY",
      customerId: c.id,
      assignedToId: c.assignedAgentId!,
    }));

  const created = data.length ? await repo.createManySkipDuplicates(data) : 0;
  logger.info({ created, candidates: candidates.length }, "tasks.sweep_passport_expiry");
  return { created };
}

/** Create PAYMENT_DUE tasks for unpaid bookings with travel approaching. */
export async function sweepPaymentDue(): Promise<{ created: number }> {
  const config = await getNotificationConfig();
  if (!config.notifyPaymentDue) return { created: 0 };

  const now = new Date();
  const windowEnd = new Date(now.getTime() + config.paymentDueWarnDays * MS_PER_DAY);
  const candidates = await repo.findPaymentDueCandidates(windowEnd);

  const data: Prisma.TaskCreateManyInput[] = candidates
    .filter((c) => c.assignedAgentId)
    .map((c) => ({
      title: "Payment due before travel",
      dueDate: c.travelDate,
      type: "PAYMENT_DUE",
      bookingId: c.id,
      assignedToId: c.assignedAgentId!,
    }));

  const created = data.length ? await repo.createManySkipDuplicates(data) : 0;
  logger.info({ created, candidates: candidates.length }, "tasks.sweep_payment_due");
  return { created };
}
