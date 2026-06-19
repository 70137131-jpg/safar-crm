import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Quotations repository — pure data access.
 *
 *   - AGENT ownership flows through the linked customer OR lead's
 *     `assignedAgentId` (a quote targets exactly one of them).
 *   - Totals are frozen by a DB trigger once a quote leaves DRAFT, so item
 *     replacement (`replaceDraftItems`) is only ever called on drafts.
 *   - OCC-sensitive transitions (send / accept / expire) go through
 *     `updateWithOcc`.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE_FULL = {
  customer: { select: { id: true, name: true, email: true, assignedAgentId: true } },
  lead: { select: { id: true, contactName: true, contactEmail: true, assignedAgentId: true } },
  items: { orderBy: { position: "asc" } },
} as const;

const LIST_SELECT = {
  id: true,
  quoteNumber: true,
  status: true,
  totalPaisa: true,
  validTill: true,
  version: true,
  createdAt: true,
  customer: { select: { name: true } },
  lead: { select: { contactName: true } },
} as const;

interface FindManyFilters {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
  status?: Prisma.QuotationWhereInput["status"];
  customerId?: string;
  leadId?: string;
  assignedAgentId?: string;
}

function ownershipWhere(assignedAgentId: string): Prisma.QuotationWhereInput {
  return {
    OR: [
      { customer: { is: { assignedAgentId } } },
      { lead: { is: { assignedAgentId } } },
    ],
  };
}

function searchWhere(search: string): Prisma.QuotationWhereInput["OR"] {
  const q = search.trim();
  return [
    { quoteNumber: { contains: q, mode: "insensitive" } },
    { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
    { lead: { is: { contactName: { contains: q, mode: "insensitive" } } } },
  ];
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(id: string, opts?: { tx?: TxClient }) {
  const client = opts?.tx ?? db;
  return client.quotation.findUnique({ where: { id }, include: INCLUDE_FULL });
}

export async function findMany(filters: FindManyFilters) {
  const and: Prisma.QuotationWhereInput[] = [];
  if (filters.assignedAgentId) and.push(ownershipWhere(filters.assignedAgentId));
  if (filters.status) and.push({ status: filters.status });
  if (filters.customerId) and.push({ customerId: filters.customerId });
  if (filters.leadId) and.push({ leadId: filters.leadId });
  if (filters.search) and.push({ OR: searchWhere(filters.search) });
  const where: Prisma.QuotationWhereInput = and.length ? { AND: and } : {};

  const orderBy: Prisma.QuotationOrderByWithRelationInput = {
    [filters.sortBy]: filters.sortOrder,
  };

  const [items, total] = await Promise.all([
    db.quotation.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.quotation.count({ where }),
  ]);

  return { items, total };
}

/** SENT quotations whose validity has lapsed — for the expiry sweep. */
export async function findExpired(now: Date) {
  return db.quotation.findMany({
    where: { status: "SENT", validTill: { not: null, lt: now } },
    select: { id: true, version: true },
  });
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function create(data: Prisma.QuotationCreateInput, tx: TxClient = db) {
  return tx.quotation.create({ data, include: INCLUDE_FULL });
}

/** Replace a draft's scalar fields and line items wholesale. DRAFT only. */
export async function replaceDraft(
  id: string,
  data: Prisma.QuotationUpdateInput,
  items: Prisma.QuotationItemCreateManyQuotationInput[],
  tx: Prisma.TransactionClient,
) {
  await tx.quotationItem.deleteMany({ where: { quotationId: id } });
  return tx.quotation.update({
    where: { id },
    data: {
      ...data,
      version: { increment: 1 },
      items: { createMany: { data: items } },
    },
    include: INCLUDE_FULL,
  });
}

/**
 * Optimistic-concurrency update for status transitions (send / accept /
 * expire). Row-locks, re-checks version, returns null on conflict. Must run in
 * a transaction.
 */
export async function updateWithOcc(
  id: string,
  expectedVersion: number,
  data: Prisma.QuotationUpdateInput,
  tx: Prisma.TransactionClient,
) {
  const locked = await tx.$queryRaw<{ version: number }[]>`
    SELECT version FROM "Quotation" WHERE id = ${id}::uuid FOR UPDATE`;
  if (locked.length === 0 || locked[0]!.version !== expectedVersion) return null;

  return tx.quotation.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
    include: INCLUDE_FULL,
  });
}

/** Set the rendered PDF key after upload (non-OCC; SENT side-effect). */
export async function setPdfKey(id: string, pdfFileKey: string, tx: TxClient = db) {
  return tx.quotation.update({ where: { id }, data: { pdfFileKey } });
}
