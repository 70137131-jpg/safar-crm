import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redactPII } from "./redact";

export interface AuditEntry {
  actorId: string | null; // null = system / cron
  action: string;          // e.g. "lead.advance"
  entity: string;          // e.g. "Lead"
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

type TxClient = PrismaClient | Prisma.TransactionClient;

/**
 * Write a single audit row. Pass `tx` to participate in the enclosing
 * transaction — audit + mutation must commit or roll back together.
 *
 * Throws on failure so the caller's transaction rolls back.
 */
export async function logAudit(entry: AuditEntry, tx: TxClient = db): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before:
          entry.before !== undefined
            ? (redactPII(entry.before) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        after:
          entry.after !== undefined
            ? (redactPII(entry.after) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  } catch (err) {
    logger.error(
      {
        err,
        entry: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          actorId: entry.actorId,
        },
      },
      "audit.write_failed",
    );
    throw err;
  }
}

/**
 * High-level wrapper: run `fn` inside a transaction and write one audit row
 * on success. Use from services for every mutation.
 *
 * Example:
 *   return withAudit(
 *     { actorId: user.id, action: "customer.create", entity: "Customer", before: null,
 *       entityIdFromResult: (c) => c.id },
 *     async (tx) => tx.customer.create({ data: input }),
 *   );
 */
export async function withAudit<T>(
  entry: Omit<AuditEntry, "entityId" | "after"> & {
    entityIdFromResult: (r: T) => string;
    afterFromResult?: (r: T) => unknown;
  },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    const result = await fn(tx);
    await logAudit(
      {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityIdFromResult(result),
        before: entry.before,
        after: entry.afterFromResult ? entry.afterFromResult(result) : result,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
      tx,
    );
    return result;
  });
}
