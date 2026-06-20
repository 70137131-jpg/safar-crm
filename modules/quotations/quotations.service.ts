import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { withAudit, logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { add, sub, mulBps, formatPKR } from "@/lib/money/paisa";
import { nextDocumentNumber } from "@/lib/numbering/numbering";
import { enqueueEmail } from "@/lib/email/outbox";
import { uploadFile, createSignedDownloadUrl } from "@/lib/storage/r2";
import * as customersService from "@/modules/customers/customers.service";
import * as leadsService from "@/modules/leads/leads.service";
import { getAgencyProfile } from "@/modules/settings/settings.service";
import { renderQuotationPdf } from "./quotation-pdf";
import * as repo from "./quotations.repository";
import type {
  CreateQuotationInput,
  UpdateQuotationInput,
  SendQuotationInput,
  AcceptQuotationInput,
  ListQuotationsInput,
  QuotationItemInput,
} from "./quotations.schemas";
import type {
  QuotationDTO,
  QuotationListItem,
  QuotationItemDTO,
  PaginatedResult,
} from "./quotations.types";

/**
 * Quotations service — draft → send → accepted/expired.
 *
 *   - Money is `bigint` paisa. Totals are computed here on every DRAFT write;
 *     a DB trigger freezes them once the quote leaves DRAFT.
 *   - `quoteNumber` is minted from a sequence at SEND (never before).
 *   - On SEND the PDF is rendered, stored in R2, and a notification email is
 *     enqueued in the SAME transaction (transactional outbox). Emails carry a
 *     summary only — no signed URLs (no customer portal in v1).
 *   - Ownership flows through the linked customer OR lead's assignedAgentId.
 */

type QuotationRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function itemsToDTO(items: QuotationRecord["items"]): QuotationItemDTO[] {
  return items.map((it) => ({
    id: it.id,
    position: it.position,
    description: it.description,
    quantity: it.quantity,
    unitPricePaisa: it.unitPricePaisa,
    linePaisa: it.linePaisa,
  }));
}

function toDTO(r: QuotationRecord): QuotationDTO {
  return {
    id: r.id,
    quoteNumber: r.quoteNumber,
    customerId: r.customerId,
    customer: r.customer
      ? { id: r.customer.id, name: r.customer.name, email: r.customer.email, assignedAgentId: r.customer.assignedAgentId }
      : null,
    leadId: r.leadId,
    lead: r.lead
      ? { id: r.lead.id, name: r.lead.contactName, email: r.lead.contactEmail, assignedAgentId: r.lead.assignedAgentId }
      : null,
    validTill: r.validTill,
    subtotalPaisa: r.subtotalPaisa,
    taxPaisa: r.taxPaisa,
    discountPaisa: r.discountPaisa,
    totalPaisa: r.totalPaisa,
    status: r.status,
    notes: r.notes,
    pdfFileKey: r.pdfFileKey,
    sentAt: r.sentAt,
    issuedAt: r.issuedAt,
    acceptedAt: r.acceptedAt,
    expiredAt: r.expiredAt,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    items: itemsToDTO(r.items),
  };
}

/** AGENT ownership token — the customer's or lead's agent owns the quote. */
function ownerAgentId(r: {
  customer: { assignedAgentId: string | null } | null;
  lead: { assignedAgentId: string | null } | null;
}): string | null {
  return r.customer?.assignedAgentId ?? r.lead?.assignedAgentId ?? null;
}

function ownershipScope(user: UserContext): string | undefined {
  return user.role === "AGENT" ? user.id : undefined;
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

/**
 * Compute line amounts and totals. `linePaisa = quantity × unitPrice` (matches
 * the DB CHECK). Tax applies to (subtotal − discount) at the agency rate.
 */
function computeTotals(items: QuotationItemInput[], discountPaisa: bigint, taxBps: number) {
  const lines = items.map((it, i) => ({
    position: i,
    description: it.description,
    quantity: it.quantity,
    unitPricePaisa: it.unitPrice,
    linePaisa: it.unitPrice * BigInt(it.quantity),
  }));
  const subtotal = lines.reduce((acc, l) => add(acc, l.linePaisa), 0n);
  if (discountPaisa > subtotal) {
    throw new ValidationError("Discount cannot exceed the subtotal.", "discount");
  }
  const taxable = sub(subtotal, discountPaisa);
  const tax = mulBps(taxable, taxBps);
  const total = add(taxable, tax);
  return { lines, subtotal, tax, total };
}

/** Verify the caller may target this customer/lead (ownership + existence). */
async function assertTargetAccess(
  user: UserContext,
  customerId: string | undefined,
  leadId: string | undefined,
): Promise<void> {
  if (customerId) await customersService.getCustomer(user, customerId);
  if (leadId) await leadsService.getLead(user, leadId);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getQuotation(user: UserContext, id: string): Promise<QuotationDTO> {
  requirePermission(user, "quotations:view");
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("Quotation not found");
  if (user.role === "AGENT" && ownerAgentId(record) !== user.id) {
    throw new NotFoundError("Quotation not found");
  }
  return toDTO(record);
}

/**
 * Mint a fresh 5-minute signed URL for the stored quotation PDF. Permission +
 * ownership + existence flow through `getQuotation`; the access is audited. The
 * URL is route-mediated and never persisted (ARCHITECTURE.md §2.7).
 */
export async function getQuotationPdfUrl(
  user: UserContext,
  id: string,
  opts?: { disposition?: "attachment" | "inline" },
): Promise<{ url: string; fileName: string }> {
  const record = await getQuotation(user, id);
  if (!record.pdfFileKey) {
    throw new NotFoundError("No PDF is available yet — send the quotation first.");
  }
  const fileName = `${record.quoteNumber ?? "quotation"}.pdf`;
  const url = await createSignedDownloadUrl({
    key: record.pdfFileKey,
    fileName,
    contentType: "application/pdf",
    disposition: opts?.disposition ?? "attachment",
  });
  await logAudit({
    actorId: user.id,
    action: "quotation.download",
    entity: "Quotation",
    entityId: id,
    before: null,
    after: { quoteNumber: record.quoteNumber },
    ip: user.ip,
    userAgent: user.userAgent,
  });
  return { url, fileName };
}

export async function listQuotations(
  user: UserContext,
  input: ListQuotationsInput,
): Promise<PaginatedResult<QuotationListItem>> {
  requirePermission(user, "quotations:view");
  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    search: input.search,
    status: input.status,
    customerId: input.customerId,
    leadId: input.leadId,
    assignedAgentId: ownershipScope(user),
  });

  return {
    items: items.map((r) => ({
      id: r.id,
      quoteNumber: r.quoteNumber,
      status: r.status,
      targetName: r.customer?.name ?? r.lead?.contactName ?? null,
      totalPaisa: r.totalPaisa,
      validTill: r.validTill,
      version: r.version,
      createdAt: r.createdAt,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createQuotation(
  user: UserContext,
  input: CreateQuotationInput,
): Promise<QuotationDTO> {
  requirePermission(user, "quotations:create");
  await assertTargetAccess(user, input.customerId, input.leadId);

  const agency = await getAgencyProfile();
  const { lines, subtotal, tax, total } = computeTotals(input.items, input.discount, agency.defaultTaxBps);

  return withAudit(
    {
      ...auditContext(user),
      action: "quotation.create",
      entity: "Quotation",
      before: null,
      entityIdFromResult: (r: QuotationDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.create(
        {
          ...(input.customerId ? { customer: { connect: { id: input.customerId } } } : {}),
          ...(input.leadId ? { lead: { connect: { id: input.leadId } } } : {}),
          validTill: input.validTill ?? null,
          subtotalPaisa: subtotal,
          discountPaisa: input.discount,
          taxPaisa: tax,
          totalPaisa: total,
          status: "DRAFT",
          notes: input.notes ?? null,
          items: { createMany: { data: lines } },
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function updateQuotation(
  user: UserContext,
  id: string,
  input: UpdateQuotationInput,
): Promise<QuotationDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Quotation not found");
  requirePermission(user, "quotations:update", { assignedAgentId: ownerAgentId(existing) });

  if (existing.status !== "DRAFT") {
    throw new ValidationError("Only draft quotations can be edited.");
  }
  if (existing.version !== input.version) {
    throw new ConflictError("This quotation was changed by someone else. Refresh and try again.");
  }
  await assertTargetAccess(user, input.customerId, input.leadId);

  const agency = await getAgencyProfile();
  const { lines, subtotal, tax, total } = computeTotals(input.items, input.discount, agency.defaultTaxBps);
  const before = toDTO(existing);

  const data: Prisma.QuotationUpdateInput = {
    customer: input.customerId ? { connect: { id: input.customerId } } : { disconnect: true },
    lead: input.leadId ? { connect: { id: input.leadId } } : { disconnect: true },
    validTill: input.validTill ?? null,
    subtotalPaisa: subtotal,
    discountPaisa: input.discount,
    taxPaisa: tax,
    totalPaisa: total,
    notes: input.notes ?? null,
  };

  return withAudit(
    {
      ...auditContext(user),
      action: "quotation.update",
      entity: "Quotation",
      before,
      entityIdFromResult: (r: QuotationDTO) => r.id,
    },
    async (tx) => toDTO(await repo.replaceDraft(id, data, lines, tx)),
  );
}

export async function sendQuotation(
  user: UserContext,
  id: string,
  input: SendQuotationInput,
): Promise<QuotationDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Quotation not found");
  requirePermission(user, "quotations:send", { assignedAgentId: ownerAgentId(existing) });

  if (existing.status !== "DRAFT") {
    throw new ValidationError("Only a draft quotation can be sent.");
  }
  if (existing.items.length === 0) {
    throw new ValidationError("Add at least one line item before sending.");
  }

  const agency = await getAgencyProfile();
  const before = toDTO(existing);
  const target = existing.customer
    ? { name: existing.customer.name, email: existing.customer.email }
    : { name: existing.lead?.contactName ?? "Customer", email: existing.lead?.contactEmail ?? null };

  return withAudit(
    {
      ...auditContext(user),
      action: "quotation.send",
      entity: "Quotation",
      before,
      entityIdFromResult: (r: QuotationDTO) => r.id,
    },
    async (tx) => {
      const issuedAt = new Date();
      const quoteNumber = await nextDocumentNumber("quote", tx, issuedAt);

      // Transition first (OCC) so a stale send fails before any I/O.
      const updated = await repo.updateWithOcc(
        id,
        input.version,
        { status: "SENT", quoteNumber, sentAt: issuedAt, issuedAt },
        tx,
      );
      if (!updated) {
        throw new ConflictError("This quotation was changed by someone else. Refresh and try again.");
      }

      // Render + store the PDF, then record its key.
      const pdf = await renderQuotationPdf({
        agency: {
          name: agency.agencyName,
          address: agency.agencyAddress,
          phone: agency.agencyPhone,
          email: agency.agencyEmail,
          website: agency.agencyWebsite,
          taxRegistrationNo: agency.taxRegistrationNo,
        },
        quoteNumber,
        issuedAt,
        validTill: updated.validTill,
        target,
        items: existing.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPricePaisa: it.unitPricePaisa,
          linePaisa: it.linePaisa,
        })),
        subtotalPaisa: updated.subtotalPaisa,
        discountPaisa: updated.discountPaisa,
        taxPaisa: updated.taxPaisa,
        totalPaisa: updated.totalPaisa,
        notes: updated.notes,
      });
      const fileKey = `quotations/${id}/${quoteNumber}.pdf`;
      await uploadFile({ key: fileKey, body: pdf, contentType: "application/pdf" });
      await repo.setPdfKey(id, fileKey, tx);

      // Notify the customer (summary only — no signed URLs). Staff download the
      // PDF from the gated quotation page.
      if (target.email) {
        const validLine = updated.validTill
          ? `, valid until ${updated.validTill.toISOString().slice(0, 10)}`
          : "";
        await enqueueEmail(tx, {
          toEmail: target.email,
          subject: `Quotation ${quoteNumber} from ${agency.agencyName}`,
          bodyHtml: `<p>Dear ${target.name},</p><p>Your quotation <strong>${quoteNumber}</strong> for ${formatPKR(updated.totalPaisa)} is ready${validLine}. Our team will share the details with you shortly.</p><p>${agency.agencyName}</p>`,
          relatedType: "Quotation",
          relatedId: id,
        });
      }

      return toDTO({ ...updated, pdfFileKey: fileKey, items: existing.items });
    },
  );
}

export async function acceptQuotation(
  user: UserContext,
  id: string,
  input: AcceptQuotationInput,
): Promise<QuotationDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Quotation not found");
  requirePermission(user, "quotations:update", { assignedAgentId: ownerAgentId(existing) });

  if (existing.status !== "SENT") {
    throw new ValidationError("Only a sent quotation can be marked accepted.");
  }
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "quotation.accept",
      entity: "Quotation",
      before,
      entityIdFromResult: (r: QuotationDTO) => r.id,
    },
    async (tx) => {
      const updated = await repo.updateWithOcc(id, input.version, { status: "ACCEPTED", acceptedAt: new Date() }, tx);
      if (!updated) {
        throw new ConflictError("This quotation was changed by someone else. Refresh and try again.");
      }
      return toDTO(updated);
    },
  );
}

/**
 * Cron: expire SENT quotations past their validity. Idempotent — already
 * expired/accepted quotes are not re-touched. System actor (no user).
 */
export async function sweepQuotationExpiry(): Promise<{ expired: number }> {
  const now = new Date();
  const due = await repo.findExpired(now);
  let expired = 0;

  for (const q of due) {
    await db.$transaction(async (tx) => {
      const updated = await repo.updateWithOcc(q.id, q.version, { status: "EXPIRED", expiredAt: now }, tx);
      if (!updated) return; // changed concurrently — skip
      await logAudit(
        {
          actorId: null,
          action: "quotation.expire",
          entity: "Quotation",
          entityId: q.id,
          before: null,
          after: { status: "EXPIRED" },
        },
        tx,
      );
      expired++;
    });
  }

  return { expired };
}
