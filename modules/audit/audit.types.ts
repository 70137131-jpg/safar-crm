/**
 * Audit-log DTOs returned by the service. Keeps Prisma's generated types from
 * leaking across the module boundary. `before`/`after` are opaque JSON —
 * already PII-redacted at write time (see `lib/audit/redact.ts`).
 */
export interface AuditActorRef {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actor: AuditActorRef | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/** Lightweight option for the actor filter dropdown. */
export interface AuditActorOption {
  id: string;
  name: string;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
