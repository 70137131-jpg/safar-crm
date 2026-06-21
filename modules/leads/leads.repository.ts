import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Leads repository — pure data access.
 *
 *   - No business logic, no audit, no email.
 *   - Soft-delete filter (`deletedAt IS NULL`) applied by default.
 *   - Accepts optional `tx` for transactional writes.
 *   - Concurrency-sensitive writes (status / assignment) go through
 *     `updateWithOcc`, which matches on `version` and returns null on conflict.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE_AGENT = {
  assignedAgent: { select: { id: true, name: true } },
} as const;

const LIST_SELECT = {
  id: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  customerId: true,
  status: true,
  source: true,
  destination: true,
  budgetPaisa: true,
  travelDate: true,
  assignedAgentId: true,
  assignedAgent: { select: { id: true, name: true } },
  version: true,
  createdAt: true,
} as const;

interface FindManyFilters {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
  status?: Prisma.LeadWhereInput["status"];
  source?: string;
  includeDeleted?: boolean;
  /** AGENT ownership scoping. */
  assignedAgentId?: string;
}

function searchWhere(search: string): Prisma.LeadWhereInput["OR"] {
  const q = search.trim();
  return [
    { contactName: { contains: q, mode: "insensitive" } },
    { contactEmail: { contains: q, mode: "insensitive" } },
    { contactPhone: { contains: q, mode: "insensitive" } },
    { destination: { contains: q, mode: "insensitive" } },
  ];
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(
  id: string,
  opts?: { includeDeleted?: boolean; tx?: TxClient },
) {
  const client = opts?.tx ?? db;
  return client.lead.findFirst({
    where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    include: INCLUDE_AGENT,
  });
}

export async function findMany(filters: FindManyFilters) {
  const where: Prisma.LeadWhereInput = {
    ...(filters.includeDeleted ? {} : { deletedAt: null }),
    ...(filters.assignedAgentId ? { assignedAgentId: filters.assignedAgentId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: { contains: filters.source, mode: "insensitive" } } : {}),
    ...(filters.search ? { OR: searchWhere(filters.search) } : {}),
  };

  const orderBy: Prisma.LeadOrderByWithRelationInput = {
    [filters.sortBy]: filters.sortOrder,
  };

  const [items, total] = await Promise.all([
    db.lead.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.lead.count({ where }),
  ]);

  return { items, total };
}

/** All non-deleted leads (capped) for the kanban board, scoped + searchable. */
export async function findForKanban(filters: {
  assignedAgentId?: string;
  search?: string;
  limit?: number;
}) {
  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(filters.assignedAgentId ? { assignedAgentId: filters.assignedAgentId } : {}),
    ...(filters.search ? { OR: searchWhere(filters.search) } : {}),
  };
  return db.lead.findMany({
    where,
    select: LIST_SELECT,
    orderBy: { updatedAt: "desc" },
    take: filters.limit ?? 500,
  });
}

export async function findHistory(leadId: string) {
  return db.leadStatusEvent.findMany({
    where: { leadId },
    include: { byUser: { select: { id: true, name: true } } },
    orderBy: { occurredAt: "desc" },
  });
}

/**
 * Count open (non-terminal) leads currently assigned to an agent. LOST and
 * TRAVELLED are terminal; everything else is still in flight. Used by the users
 * module to block deactivating a user before their pipeline is reassigned.
 */
export async function countOpenByAgent(agentId: string): Promise<number> {
  return db.lead.count({
    where: {
      assignedAgentId: agentId,
      deletedAt: null,
      status: { notIn: ["LOST", "TRAVELLED"] },
    },
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function create(data: Prisma.LeadCreateInput, tx: TxClient = db) {
  return tx.lead.create({ data, include: INCLUDE_AGENT });
}

/** Plain update (non-OCC). Bumps `version`. Used for field edits. */
export async function update(
  id: string,
  data: Prisma.LeadUpdateInput,
  tx: TxClient = db,
) {
  return tx.lead.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
    include: INCLUDE_AGENT,
  });
}

/**
 * Optimistic-concurrency update: only applies if `version` still matches the
 * value the client read. Returns the fresh row, or `null` on a version
 * conflict (caller maps null → ConflictError). Mirrors ARCHITECTURE.md §2.5.
 *
 * Implemented as `SELECT … FOR UPDATE` (row lock) + version re-check + a normal
 * `update`. `updateMany` can't be used here because its input omits relation /
 * FK columns (assignedAgentId, customerId), which assignment and conversion
 * need to change. The row lock makes the check-then-write atomic: a concurrent
 * transition blocks until we commit, then reads the bumped version and conflicts.
 * Must run inside a transaction (always called via withAudit).
 */
export async function updateWithOcc(
  id: string,
  expectedVersion: number,
  data: Prisma.LeadUpdateInput,
  tx: TxClient = db,
) {
  const locked = await tx.$queryRaw<{ version: number }[]>`
    SELECT version FROM "Lead"
    WHERE id = ${id}::uuid AND "deletedAt" IS NULL
    FOR UPDATE`;
  if (locked.length === 0 || locked[0]!.version !== expectedVersion) return null;

  return tx.lead.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
    include: INCLUDE_AGENT,
  });
}

export async function softDelete(id: string, tx: TxClient = db) {
  return tx.lead.update({
    where: { id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
    include: INCLUDE_AGENT,
  });
}

export async function restore(id: string, tx: TxClient = db) {
  return tx.lead.update({
    where: { id },
    data: { deletedAt: null, version: { increment: 1 } },
    include: INCLUDE_AGENT,
  });
}

export async function createStatusEvent(
  data: Prisma.LeadStatusEventCreateInput,
  tx: TxClient = db,
) {
  return tx.leadStatusEvent.create({ data });
}
