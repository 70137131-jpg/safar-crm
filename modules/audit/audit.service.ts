import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import * as repo from "./audit.repository";
import type { ListAuditLogsInput } from "./audit.schemas";
import type { AuditActorOption, AuditLogItem, PaginatedResult } from "./audit.types";

/**
 * Audit-log service — read-only viewer behind `audit:view` (ADMIN/MANAGER).
 *
 * Audit rows are organisation-wide: there is no ownership scoping here (unlike
 * customers/leads). `before`/`after` arrive already PII-redacted from the write
 * path, so the viewer can surface them as-is.
 */

type AuditRecord = Awaited<ReturnType<typeof repo.findMany>>["items"][number];

function toItem(r: AuditRecord): AuditLogItem {
  return {
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    actor: r.actor
      ? { id: r.actor.id, name: r.actor.name, email: r.actor.email }
      : null,
    before: r.before,
    after: r.after,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
  };
}

export async function listAuditLogs(
  user: UserContext,
  input: ListAuditLogsInput,
): Promise<PaginatedResult<AuditLogItem>> {
  requirePermission(user, "audit:view");

  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    sortOrder: input.sortOrder,
    entity: input.entity,
    action: input.action,
    actorId: input.actorId,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return {
    items: items.map(toItem),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function listAuditActors(
  user: UserContext,
): Promise<AuditActorOption[]> {
  requirePermission(user, "audit:view");
  return repo.listActors();
}
