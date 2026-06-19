import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Invoices repository — pure data access. Invoices are never deleted; an
 * issued-in-error invoice is CANCELLED (voided).
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE_BOOKING = {
  booking: { select: { bookingNumber: true } },
} as const;

const LIST_SELECT = {
  id: true,
  invoiceNumber: true,
  bookingId: true,
  amountPaisa: true,
  status: true,
  issuedAt: true,
  booking: { select: { bookingNumber: true } },
} as const;

interface FindManyFilters {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  status?: Prisma.InvoiceWhereInput["status"];
  bookingId?: string;
}

export async function findById(id: string, tx: TxClient = db) {
  return tx.invoice.findUnique({ where: { id }, include: INCLUDE_BOOKING });
}

export async function findMany(filters: FindManyFilters) {
  const where: Prisma.InvoiceWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.bookingId ? { bookingId: filters.bookingId } : {}),
  };
  const orderBy: Prisma.InvoiceOrderByWithRelationInput = {
    [filters.sortBy]: filters.sortOrder,
  };
  const [items, total] = await Promise.all([
    db.invoice.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.invoice.count({ where }),
  ]);
  return { items, total };
}

export async function create(data: Prisma.InvoiceCreateInput, tx: TxClient = db) {
  return tx.invoice.create({ data, include: INCLUDE_BOOKING });
}

export async function update(id: string, data: Prisma.InvoiceUpdateInput, tx: TxClient = db) {
  return tx.invoice.update({ where: { id }, data, include: INCLUDE_BOOKING });
}
