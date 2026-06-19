import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/numbering/numbering";
import * as bookingsService from "@/modules/bookings/bookings.service";
import * as repo from "./invoices.repository";
import type { CreateInvoiceInput, VoidInvoiceInput, ListInvoicesInput } from "./invoices.schemas";
import type { InvoiceDTO, InvoiceListItem, PaginatedResult } from "./invoices.types";

/**
 * Invoices service — issue / mark-paid / void, tied to a Booking.
 *
 *   - Money is `bigint` paisa; amount defaults to the booking total.
 *   - `invoiceNumber` is minted from a sequence at creation.
 *   - Invoices are an ACCOUNTANT/ADMIN function (RBAC). None of the permitted
 *     roles are ownership-scoped, so there is no per-agent filtering here.
 */

type InvoiceRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(r: InvoiceRecord): InvoiceDTO {
  return {
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    bookingId: r.bookingId,
    bookingNumber: r.booking?.bookingNumber ?? null,
    amountPaisa: r.amountPaisa,
    status: r.status,
    issuedAt: r.issuedAt,
    paidAt: r.paidAt,
    cancelledAt: r.cancelledAt,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

export async function getInvoice(user: UserContext, id: string): Promise<InvoiceDTO> {
  requirePermission(user, "invoices:view");
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("Invoice not found");
  return toDTO(record);
}

export async function listInvoices(
  user: UserContext,
  input: ListInvoicesInput,
): Promise<PaginatedResult<InvoiceListItem>> {
  requirePermission(user, "invoices:view");
  const { items, total } = await repo.findMany(input);
  return {
    items: items.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      bookingId: r.bookingId,
      bookingNumber: r.booking?.bookingNumber ?? null,
      amountPaisa: r.amountPaisa,
      status: r.status,
      issuedAt: r.issuedAt,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function createInvoice(
  user: UserContext,
  input: CreateInvoiceInput,
): Promise<InvoiceDTO> {
  requirePermission(user, "invoices:create");
  const booking = await bookingsService.getBooking(user, input.bookingId); // existence
  const amountPaisa = input.amount ?? booking.totalPricePaisa;

  return withAudit(
    {
      ...auditContext(user),
      action: "invoice.create",
      entity: "Invoice",
      before: null,
      entityIdFromResult: (r: InvoiceDTO) => r.id,
    },
    async (tx) => {
      const invoiceNumber = await nextDocumentNumber("invoice", tx);
      const record = await repo.create(
        {
          invoiceNumber,
          booking: { connect: { id: input.bookingId } },
          amountPaisa,
          status: "ISSUED",
          notes: input.notes ?? null,
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function markInvoicePaid(user: UserContext, id: string): Promise<InvoiceDTO> {
  requirePermission(user, "invoices:update");
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Invoice not found");
  if (existing.status !== "ISSUED") {
    throw new ValidationError(`Only an issued invoice can be marked paid (it is ${existing.status}).`);
  }
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "invoice.markPaid",
      entity: "Invoice",
      before,
      entityIdFromResult: (r: InvoiceDTO) => r.id,
    },
    async (tx) => toDTO(await repo.update(id, { status: "PAID", paidAt: new Date() }, tx)),
  );
}

export async function voidInvoice(
  user: UserContext,
  id: string,
  input: VoidInvoiceInput,
): Promise<InvoiceDTO> {
  requirePermission(user, "invoices:void");
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Invoice not found");
  if (existing.status !== "ISSUED") {
    throw new ValidationError(`Only an issued invoice can be voided (it is ${existing.status}).`);
  }
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "invoice.void",
      entity: "Invoice",
      before,
      entityIdFromResult: (r: InvoiceDTO) => r.id,
    },
    async (tx) =>
      toDTO(
        await repo.update(
          id,
          { status: "CANCELLED", cancelledAt: new Date(), notes: input.reason ?? existing.notes },
          tx,
        ),
      ),
  );
}
