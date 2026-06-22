import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Audit repository — pure data access over the append-only `AuditLog`.
 *
 *   - No business logic, no permission checks (those live in the service).
 *   - Read-only: the audit log is never updated or deleted from the app.
 *   - Audit rows are org-wide, so there is no soft-delete / ownership filter.
 */

const ACTOR_SELECT = {
  actor: { select: { id: true, name: true, email: true } },
} as const;

export interface AuditFindManyFilters {
  page: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
  entity?: string;
  action?: string;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
}

function buildWhere(f: AuditFindManyFilters): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.startDate) createdAt.gte = f.startDate;
  if (f.endDate) {
    // The picker hands us a date at midnight; include the whole day.
    const end = new Date(f.endDate);
    end.setHours(23, 59, 59, 999);
    createdAt.lte = end;
  }

  return {
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.action ? { action: { contains: f.action, mode: "insensitive" } } : {}),
    ...(f.actorId ? { actorId: f.actorId } : {}),
    ...(f.startDate || f.endDate ? { createdAt } : {}),
  };
}

export async function findMany(filters: AuditFindManyFilters) {
  const where = buildWhere(filters);

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: ACTOR_SELECT,
      orderBy: { createdAt: filters.sortOrder },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return { items, total };
}

/** Distinct actors that appear in the log — powers the actor filter dropdown. */
export async function listActors(): Promise<{ id: string; name: string }[]> {
  const rows = await db.auditLog.findMany({
    where: { actorId: { not: null } },
    distinct: ["actorId"],
    select: { actor: { select: { id: true, name: true } } },
  });

  return rows
    .map((r) => r.actor)
    .filter((a): a is { id: string; name: string } => a !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
