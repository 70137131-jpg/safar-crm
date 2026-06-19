import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Bookings repository — pure data access.
 *
 *   - No business logic, no audit, no email.
 *   - Soft-delete filter (`deletedAt IS NULL`) applied by default.
 *   - AGENT ownership is scoped through the linked customer's `assignedAgentId`
 *     (bookings have no agent column of their own).
 *   - Concurrency-sensitive writes (status / cancel) go through `updateWithOcc`.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE_CUSTOMER = {
  customer: { select: { id: true, name: true, assignedAgentId: true } },
} as const;

const LIST_SELECT = {
  id: true,
  bookingNumber: true,
  customerId: true,
  customer: { select: { id: true, name: true, assignedAgentId: true } },
  status: true,
  travelDate: true,
  totalPricePaisa: true,
  version: true,
  createdAt: true,
} as const;

interface FindManyFilters {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
  status?: Prisma.BookingWhereInput["status"];
  customerId?: string;
  includeDeleted?: boolean;
  /** AGENT ownership scoping (matched against the customer's agent). */
  assignedAgentId?: string;
}

function searchWhere(search: string): Prisma.BookingWhereInput["OR"] {
  const q = search.trim();
  return [
    { bookingNumber: { contains: q, mode: "insensitive" } },
    { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
  ];
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(
  id: string,
  opts?: { includeDeleted?: boolean; tx?: TxClient },
) {
  const client = opts?.tx ?? db;
  return client.booking.findFirst({
    where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    include: INCLUDE_CUSTOMER,
  });
}

export async function findMany(filters: FindManyFilters) {
  const where: Prisma.BookingWhereInput = {
    ...(filters.includeDeleted ? {} : { deletedAt: null }),
    ...(filters.assignedAgentId
      ? { customer: { is: { assignedAgentId: filters.assignedAgentId } } }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.search ? { OR: searchWhere(filters.search) } : {}),
  };

  const orderBy: Prisma.BookingOrderByWithRelationInput = {
    [filters.sortBy]: filters.sortOrder,
  };

  const [items, total] = await Promise.all([
    db.booking.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.booking.count({ where }),
  ]);

  return { items, total };
}

export async function findHistory(bookingId: string) {
  return db.bookingStatusEvent.findMany({
    where: { bookingId },
    include: { byUser: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function create(data: Prisma.BookingCreateInput, tx: TxClient = db) {
  return tx.booking.create({ data, include: INCLUDE_CUSTOMER });
}

/** Plain update (non-OCC). Bumps `version`. Used for field edits. */
export async function update(
  id: string,
  data: Prisma.BookingUpdateInput,
  tx: TxClient = db,
) {
  return tx.booking.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
    include: INCLUDE_CUSTOMER,
  });
}

/**
 * Optimistic-concurrency update: only applies if `version` still matches the
 * value the client read. Returns the fresh row, or `null` on a version
 * conflict. Implemented as `SELECT … FOR UPDATE` (row lock) + version re-check
 * + a normal update, so concurrent transitions serialise. Must run inside a
 * transaction (always called via withAudit).
 */
export async function updateWithOcc(
  id: string,
  expectedVersion: number,
  data: Prisma.BookingUpdateInput,
  tx: TxClient = db,
) {
  const locked = await tx.$queryRaw<{ version: number }[]>`
    SELECT version FROM "Booking"
    WHERE id = ${id}::uuid AND "deletedAt" IS NULL
    FOR UPDATE`;
  if (locked.length === 0 || locked[0]!.version !== expectedVersion) return null;

  return tx.booking.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
    include: INCLUDE_CUSTOMER,
  });
}

export async function createStatusEvent(
  data: Prisma.BookingStatusEventCreateInput,
  tx: TxClient = db,
) {
  return tx.bookingStatusEvent.create({ data });
}
