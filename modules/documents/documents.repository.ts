import type { DocumentType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Documents repository — pure data access. No business logic, no audit, no R2.
 *
 * `Document` has no `deletedAt` (soft delete is reserved for Customer / Lead /
 * Booking per ARCHITECTURE.md §2.4); deletes here are hard deletes.
 *
 * Parent-ownership reads (customer / booking) live here intentionally: the
 * documents service needs `assignedAgentId` to authorize AGENT access, and the
 * bookings module exposes no service yet. We read those aggregates' minimal
 * ownership columns rather than importing another module's repository.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const DOCUMENT_INCLUDE = {
  uploadedBy: { select: { id: true, name: true } },
} as const;

/** findById additionally resolves the parent's ownership for authorization. */
const DOCUMENT_INCLUDE_WITH_PARENTS = {
  uploadedBy: { select: { id: true, name: true } },
  customer: { select: { id: true, assignedAgentId: true, deletedAt: true } },
  booking: {
    select: {
      id: true,
      deletedAt: true,
      customer: { select: { id: true, assignedAgentId: true, deletedAt: true } },
    },
  },
} as const;

export interface CreateDocumentData {
  type: DocumentType;
  fileKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  expiryDate: Date | null;
  customerId: string | null;
  bookingId: string | null;
  uploadedById: string;
}

export interface UpdateDocumentData {
  type?: DocumentType;
  expiryDate?: Date | null;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function findById(id: string, opts?: { tx?: TxClient }) {
  const client = opts?.tx ?? db;
  return client.document.findUnique({
    where: { id },
    include: DOCUMENT_INCLUDE_WITH_PARENTS,
  });
}

export async function findByCustomer(customerId: string) {
  return db.document.findMany({
    where: { customerId },
    include: DOCUMENT_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function findByBooking(bookingId: string) {
  return db.document.findMany({
    where: { bookingId },
    include: DOCUMENT_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export interface SearchFilters {
  customerId?: string;
  bookingId?: string;
  type?: DocumentType;
}

export async function search(filters: SearchFilters) {
  const where: Prisma.DocumentWhereInput = {
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.bookingId ? { bookingId: filters.bookingId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };
  return db.document.findMany({
    where,
    include: DOCUMENT_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Documents of a given type with an expiry date inside `[from, to]`.
 * Includes the linked customer's agent for task assignment (cron use).
 */
export async function findExpiringByType(type: DocumentType, from: Date, to: Date) {
  return db.document.findMany({
    where: { type, expiryDate: { gte: from, lte: to } },
    include: {
      customer: { select: { id: true, name: true, assignedAgentId: true, deletedAt: true } },
    },
    orderBy: { expiryDate: "asc" },
  });
}

// ─── Parent ownership lookups (for authorization) ────────────────────────────

export async function findCustomerOwnership(customerId: string) {
  return db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, assignedAgentId: true },
  });
}

export async function findBookingOwnership(bookingId: string) {
  return db.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      customer: { select: { id: true, assignedAgentId: true } },
    },
  });
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export async function create(data: CreateDocumentData, tx: TxClient = db) {
  return tx.document.create({ data, include: DOCUMENT_INCLUDE });
}

export async function update(id: string, data: UpdateDocumentData, tx: TxClient = db) {
  return tx.document.update({ where: { id }, data, include: DOCUMENT_INCLUDE });
}

/** Hard delete — Document has no soft-delete column. */
export async function deleteById(id: string, tx: TxClient = db) {
  return tx.document.delete({ where: { id }, include: DOCUMENT_INCLUDE });
}
