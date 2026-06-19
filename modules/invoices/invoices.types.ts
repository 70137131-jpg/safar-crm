import type { InvoiceStatus } from "@prisma/client";

/** Invoice DTOs. `amountPaisa` stays `bigint`. */
export interface InvoiceDTO {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingNumber: string | null;
  amountPaisa: bigint;
  status: InvoiceStatus;
  issuedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  notes: string | null;
  createdAt: Date;
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingNumber: string | null;
  amountPaisa: bigint;
  status: InvoiceStatus;
  issuedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
