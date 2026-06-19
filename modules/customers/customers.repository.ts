import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Customers repository — pure data access.
 *
 * Rules:
 *   - No business logic, no audit, no email.
 *   - Soft-delete filter (`deletedAt IS NULL`) applied by default.
 *   - Accepts optional `tx` for transactional writes.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const CUSTOMER_INCLUDE_AGENT = {
  assignedAgent: { select: { id: true, name: true, email: true, role: true } },
} as const;

const CUSTOMER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  nationality: true,
  passportExpiry: true,
  assignedAgentId: true,
  assignedAgent: { select: { id: true, name: true } },
  createdAt: true,
  deletedAt: true,
} as const;

// ─── Filters ────────────────────────────────────────────────────────────────

interface FindManyFilters {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
  includeDeleted?: boolean;
  /** AGENT ownership scoping — if set, only returns records assigned to this user. */
  assignedAgentId?: string;
}

interface SearchFilters {
  query: string;
  page: number;
  pageSize: number;
  assignedAgentId?: string;
}

// ─── Repository functions ───────────────────────────────────────────────────

export async function findById(
  id: string,
  opts?: { includeDeleted?: boolean; tx?: TxClient },
) {
  const client = opts?.tx ?? db;
  return client.customer.findFirst({
    where: {
      id,
      ...(opts?.includeDeleted ? {} : { deletedAt: null }),
    },
    include: CUSTOMER_INCLUDE_AGENT,
  });
}

export async function findMany(filters: FindManyFilters) {
  const where: Prisma.CustomerWhereInput = {
    ...(filters.includeDeleted ? {} : { deletedAt: null }),
    ...(filters.assignedAgentId
      ? { assignedAgentId: filters.assignedAgentId }
      : {}),
  };

  if (filters.search) {
    const search = filters.search.trim();
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.CustomerOrderByWithRelationInput = {
    [filters.sortBy]: filters.sortOrder,
  };

  const [items, total] = await Promise.all([
    db.customer.findMany({
      where,
      select: CUSTOMER_LIST_SELECT,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.customer.count({ where }),
  ]);

  return { items, total };
}

export async function search(filters: SearchFilters) {
  const query = filters.query.trim();
  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    ...(filters.assignedAgentId
      ? { assignedAgentId: filters.assignedAgentId }
      : {}),
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
      // Passport last-4 search — match ending chars
      ...(query.length >= 2
        ? [{ passportNo: { endsWith: query.toUpperCase() } }]
        : []),
    ],
  };

  const [items, total] = await Promise.all([
    db.customer.findMany({
      where,
      select: CUSTOMER_LIST_SELECT,
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.customer.count({ where }),
  ]);

  return { items, total };
}

export async function create(
  data: Prisma.CustomerCreateInput,
  tx: TxClient = db,
) {
  return tx.customer.create({
    data,
    include: CUSTOMER_INCLUDE_AGENT,
  });
}

export async function update(
  id: string,
  data: Prisma.CustomerUpdateInput,
  tx: TxClient = db,
) {
  return tx.customer.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
    include: CUSTOMER_INCLUDE_AGENT,
  });
}

export async function softDelete(id: string, tx: TxClient = db) {
  return tx.customer.update({
    where: { id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
    include: CUSTOMER_INCLUDE_AGENT,
  });
}

export async function restore(id: string, tx: TxClient = db) {
  return tx.customer.update({
    where: { id },
    data: { deletedAt: null, version: { increment: 1 } },
    include: CUSTOMER_INCLUDE_AGENT,
  });
}

export async function existsByEmail(email: string, excludeId?: string) {
  const count = await db.customer.count({
    where: {
      email: { equals: email, mode: "insensitive" },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return count > 0;
}

export async function existsByPhone(phone: string, excludeId?: string) {
  const count = await db.customer.count({
    where: {
      phone,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return count > 0;
}

/**
 * List only soft-deleted records — for the trash page.
 */
export async function findDeleted(filters: {
  page: number;
  pageSize: number;
  assignedAgentId?: string;
}) {
  const where: Prisma.CustomerWhereInput = {
    deletedAt: { not: null },
    ...(filters.assignedAgentId
      ? { assignedAgentId: filters.assignedAgentId }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.customer.findMany({
      where,
      select: CUSTOMER_LIST_SELECT,
      orderBy: { deletedAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.customer.count({ where }),
  ]);

  return { items, total };
}
