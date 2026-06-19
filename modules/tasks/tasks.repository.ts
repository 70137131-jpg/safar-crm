import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Tasks repository — pure data access.
 *
 *   - AGENT ownership is the `assignedToId`.
 *   - Sweep inserts use `createMany({ skipDuplicates: true })`; the partial
 *     unique indexes (one OPEN passport-expiry per customer, one OPEN
 *     payment-due per booking) make repeated sweeps idempotent.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE = {
  assignedTo: { select: { id: true, name: true } },
} as const;

interface FindManyFilters {
  page: number;
  pageSize: number;
  status?: Prisma.TaskWhereInput["status"];
  type?: Prisma.TaskWhereInput["type"];
  assignedToId?: string;
}

export async function findById(id: string, tx: TxClient = db) {
  return tx.task.findUnique({ where: { id }, include: INCLUDE });
}

export async function findMany(filters: FindManyFilters) {
  const where: Prisma.TaskWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
  };
  const [items, total] = await Promise.all([
    db.task.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.task.count({ where }),
  ]);
  return { items, total };
}

export async function create(data: Prisma.TaskCreateInput, tx: TxClient = db) {
  return tx.task.create({ data, include: INCLUDE });
}

export async function update(id: string, data: Prisma.TaskUpdateInput, tx: TxClient = db) {
  return tx.task.update({ where: { id }, data, include: INCLUDE });
}

/** Bulk insert sweep-generated tasks; conflicts (partial unique) are skipped. */
export async function createManySkipDuplicates(
  data: Prisma.TaskCreateManyInput[],
): Promise<number> {
  const r = await db.task.createMany({ data, skipDuplicates: true });
  return r.count;
}

// ─── Cron sweep support ──────────────────────────────────────────────────────

/** OPEN tasks already due and not yet reminded — for the reminder sweep. */
export async function findDueForReminder(now: Date, take = 100) {
  return db.task.findMany({
    where: { status: "OPEN", dueDate: { lte: now }, reminderSentAt: null },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: { dueDate: "asc" },
    take,
  });
}

/**
 * Atomically claim a task for reminding: sets `reminderSentAt` only if still
 * null. Returns true if this caller won the claim (idempotent under double-fire).
 */
export async function claimReminder(id: string, now: Date, tx: TxClient = db): Promise<boolean> {
  const r = await tx.task.updateMany({
    where: { id, reminderSentAt: null },
    data: { reminderSentAt: now, reminderCount: { increment: 1 } },
  });
  return r.count > 0;
}

/** Customers whose passport expires within the window and who have an agent. */
export async function findPassportExpiryCandidates(from: Date, to: Date) {
  return db.customer.findMany({
    where: {
      deletedAt: null,
      assignedAgentId: { not: null },
      passportExpiry: { gte: from, lte: to },
    },
    select: { id: true, name: true, assignedAgentId: true, passportExpiry: true },
  });
}

/**
 * Active bookings with travel approaching and an outstanding balance
 * (total > collected PAID). Returns the agent to assign the task to.
 */
export async function findPaymentDueCandidates(windowEnd: Date) {
  return db.$queryRaw<
    { id: string; assignedAgentId: string | null; travelDate: Date; balance: bigint }[]
  >`
    SELECT b.id,
           c."assignedAgentId" AS "assignedAgentId",
           b."travelDate"      AS "travelDate",
           b."totalPricePaisa" - COALESCE(SUM(p."amountPaisa") FILTER (WHERE p.status = 'PAID'), 0) AS balance
    FROM "Booking" b
    JOIN "Customer" c ON c.id = b."customerId"
    LEFT JOIN "Payment" p ON p."bookingId" = b.id
    WHERE b."deletedAt" IS NULL
      AND b.status IN ('PENDING', 'CONFIRMED', 'TICKETED')
      AND b."travelDate" IS NOT NULL
      AND b."travelDate" <= ${windowEnd}
      AND c."assignedAgentId" IS NOT NULL
    GROUP BY b.id, c."assignedAgentId"
    HAVING b."totalPricePaisa" - COALESCE(SUM(p."amountPaisa") FILTER (WHERE p.status = 'PAID'), 0) > 0`;
}
