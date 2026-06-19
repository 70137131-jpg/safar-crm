import type { UserRole } from "@prisma/client";

/**
 * Customer DTO returned by services. Avoids leaking Prisma's generated
 * types across module boundaries.
 */
export interface CustomerDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  passportNo: string | null;
  passportExpiry: Date | null;
  dob: Date | null;
  address: string | null;
  notes: string | null;
  assignedAgentId: string | null;
  assignedAgent: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Lightweight shape for table rows — omits sensitive fields. */
export interface CustomerListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  passportExpiry: Date | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string } | null;
  createdAt: Date;
  deletedAt: Date | null;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Per-row import outcome. */
export interface ImportRowResult {
  row: number;
  success: boolean;
  error?: string;
  name?: string;
}

/** Overall import result. */
export interface ImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: ImportRowResult[];
}
