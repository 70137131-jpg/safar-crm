import type { QuotationStatus } from "@prisma/client";

/**
 * Quotation DTOs. All money stays `bigint` paisa. Ownership flows through the
 * linked customer or lead's `assignedAgentId`.
 */
export interface QuotationItemDTO {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unitPricePaisa: bigint;
  linePaisa: bigint;
}

export interface QuotationTargetSummary {
  id: string;
  name: string;
  email: string | null;
  assignedAgentId: string | null;
}

export interface QuotationDTO {
  id: string;
  quoteNumber: string | null;
  customerId: string | null;
  customer: QuotationTargetSummary | null;
  leadId: string | null;
  lead: QuotationTargetSummary | null;
  validTill: Date | null;
  subtotalPaisa: bigint;
  taxPaisa: bigint;
  discountPaisa: bigint;
  totalPaisa: bigint;
  status: QuotationStatus;
  notes: string | null;
  pdfFileKey: string | null;
  sentAt: Date | null;
  issuedAt: Date | null;
  acceptedAt: Date | null;
  expiredAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  items: QuotationItemDTO[];
}

export interface QuotationListItem {
  id: string;
  quoteNumber: string | null;
  status: QuotationStatus;
  targetName: string | null;
  totalPaisa: bigint;
  validTill: Date | null;
  version: number;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
