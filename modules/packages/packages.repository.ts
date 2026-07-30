import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type TxClient = typeof db | Prisma.TransactionClient;

export function findById(id: string, tx: TxClient = db) {
  return tx.package.findUnique({ where: { id } });
}

export function findMany(activeOnly = false) {
  return db.package.findMany({
    where: activeOnly ? { status: "ACTIVE" } : undefined,
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });
}

export function create(data: Prisma.PackageCreateInput, tx: TxClient = db) {
  return tx.package.create({ data });
}

export function update(id: string, data: Prisma.PackageUpdateInput, tx: TxClient = db) {
  return tx.package.update({ where: { id }, data });
}
