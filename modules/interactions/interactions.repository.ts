import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Interactions repository — pure data access.
 * Interactions are append-light: no soft delete (no `deletedAt` column),
 * so `remove` is a hard delete.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const INCLUDE_CREATOR = {
  createdBy: { select: { id: true, name: true } },
} as const;

export async function findById(id: string, tx: TxClient = db) {
  return tx.interaction.findUnique({ where: { id }, include: INCLUDE_CREATOR });
}

export async function findByLead(leadId: string) {
  return db.interaction.findMany({
    where: { leadId },
    include: INCLUDE_CREATOR,
    orderBy: { occurredAt: "desc" },
  });
}

export async function findByCustomer(customerId: string) {
  return db.interaction.findMany({
    where: { customerId },
    include: INCLUDE_CREATOR,
    orderBy: { occurredAt: "desc" },
  });
}

export async function create(data: Prisma.InteractionCreateInput, tx: TxClient = db) {
  return tx.interaction.create({ data, include: INCLUDE_CREATOR });
}

export async function update(
  id: string,
  data: Prisma.InteractionUpdateInput,
  tx: TxClient = db,
) {
  return tx.interaction.update({ where: { id }, data, include: INCLUDE_CREATOR });
}

export async function remove(id: string, tx: TxClient = db) {
  return tx.interaction.delete({ where: { id }, include: INCLUDE_CREATOR });
}
