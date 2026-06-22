"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import { listAuditLogsSchema } from "./audit.schemas";
import type { AuditActorOption, AuditLogItem, PaginatedResult } from "./audit.types";
import * as service from "./audit.service";

/**
 * Audit server actions. Each: requireUser() → Zod parse → service
 * (which authorizes via requirePermission) → typed ActionResult.
 */

export const listAuditLogsAction = serverAction(
  "audit.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<AuditLogItem>> => {
    const user = await requireUser();
    return service.listAuditLogs(user, listAuditLogsSchema.parse(params));
  },
);

export const listAuditActorsAction = serverAction(
  "audit.actors",
  async (): Promise<AuditActorOption[]> => {
    const user = await requireUser();
    return service.listAuditActors(user);
  },
);
