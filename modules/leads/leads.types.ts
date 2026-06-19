import type {
  LeadStatus,
  TripPurpose,
  RouteShape,
  LostReason,
} from "@prisma/client";

/**
 * Lead DTOs returned by the service. Avoids leaking Prisma's generated types
 * across module boundaries. `budgetPaisa` stays a `bigint` (money is paisa).
 */
export interface LeadDTO {
  id: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  customerId: string | null;
  status: LeadStatus;
  source: string | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string } | null;
  destination: string | null;
  tripPurpose: TripPurpose | null;
  routeShape: RouteShape | null;
  pax: number | null;
  budgetPaisa: bigint | null;
  travelDate: Date | null;
  lostReason: LostReason | null;
  lostNotes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Lightweight shape for table rows and kanban cards. */
export interface LeadListItem {
  id: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  customerId: string | null;
  status: LeadStatus;
  source: string | null;
  destination: string | null;
  budgetPaisa: bigint | null;
  travelDate: Date | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string } | null;
  version: number;
  createdAt: Date;
}

/** One row of the lead's status-transition history. */
export interface LeadStatusEventDTO {
  id: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  reason: string | null;
  byUser: { id: string; name: string } | null;
  occurredAt: Date;
}

/** Kanban grouped by status column. */
export type KanbanColumns = Record<LeadStatus, LeadListItem[]>;

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Outcome of converting a lead to a customer + booking. */
export interface ConvertResult {
  lead: LeadDTO;
  customerId: string;
  bookingId: string;
  bookingNumber: string;
}
