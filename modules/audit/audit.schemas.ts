import { z } from "zod";

/**
 * Audit-log viewer input. Read-only — no write schemas (the audit log is
 * append-only and written by `withAudit`/`logAudit`, never by a UI action).
 *
 * Empty filter values are sent as `undefined` by the client, so the optional
 * validators below never see `""`.
 */
export const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  entity: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;
