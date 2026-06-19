import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { normalizePakistaniPhone } from "@/lib/phone/normalize";
import { nextDocumentNumber } from "@/lib/numbering/numbering";
import * as repo from "./leads.repository";
import type {
  CreateLeadInput,
  UpdateLeadInput,
  ListLeadsInput,
  KanbanLeadsInput,
  ChangeLeadStatusInput,
  AssignLeadInput,
  ConvertLeadInput,
} from "./leads.schemas";
import { LEAD_STATUSES } from "./leads.schemas";
import type {
  LeadDTO,
  LeadListItem,
  LeadStatusEventDTO,
  KanbanColumns,
  PaginatedResult,
  ConvertResult,
} from "./leads.types";

/**
 * Leads service — business logic, status rules, OCC, audit.
 *
 * Status rules (ARCHITECTURE.md / module spec):
 *   - BOOKED is reachable only via conversion (never set manually).
 *   - TRAVELLED requires the lead to currently be BOOKED.
 *   - LOST is reachable from any stage and requires a reason.
 *   - Status changes and reassignment use optimistic concurrency (`version`).
 *
 * NOTE: AGENT scoping is ownership-only here. "Explicitly shared leads"
 * requires a `record_shares` table (deferred to Phase 2) — when it lands,
 * widen `ownershipScope`, `findById` access, and the repo filters.
 */

type LeadRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(r: LeadRecord): LeadDTO {
  return {
    id: r.id,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    contactEmail: r.contactEmail,
    customerId: r.customerId,
    status: r.status,
    source: r.source,
    assignedAgentId: r.assignedAgentId,
    assignedAgent: r.assignedAgent,
    destination: r.destination,
    tripPurpose: r.tripPurpose,
    routeShape: r.routeShape,
    pax: r.pax,
    budgetPaisa: r.budgetPaisa,
    travelDate: r.travelDate,
    lostReason: r.lostReason,
    lostNotes: r.lostNotes,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

function toListItem(r: {
  id: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  customerId: string | null;
  status: LeadDTO["status"];
  source: string | null;
  destination: string | null;
  budgetPaisa: bigint | null;
  travelDate: Date | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string } | null;
  version: number;
  createdAt: Date;
}): LeadListItem {
  return { ...r };
}

function ownershipScope(user: UserContext): string | undefined {
  return user.role === "AGENT" ? user.id : undefined;
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getLead(user: UserContext, id: string): Promise<LeadDTO> {
  requirePermission(user, "leads:view");
  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("Lead not found");
  if (user.role === "AGENT" && record.assignedAgentId !== user.id) {
    throw new NotFoundError("Lead not found");
  }
  return toDTO(record);
}

export async function listLeads(
  user: UserContext,
  input: ListLeadsInput,
): Promise<PaginatedResult<LeadListItem>> {
  requirePermission(user, "leads:view");
  const includeDeleted =
    input.includeDeleted && (user.role === "ADMIN" || user.role === "MANAGER");

  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    search: input.search,
    status: input.status,
    source: input.source,
    includeDeleted,
    assignedAgentId: ownershipScope(user) ?? input.assignedAgentId,
  });

  return {
    items: items.map(toListItem),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function getKanban(
  user: UserContext,
  input: KanbanLeadsInput,
): Promise<KanbanColumns> {
  requirePermission(user, "leads:view");
  const rows = await repo.findForKanban({
    search: input.search,
    assignedAgentId: ownershipScope(user) ?? input.assignedAgentId,
  });

  const columns = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, [] as LeadListItem[]]),
  ) as KanbanColumns;
  for (const row of rows) columns[row.status].push(toListItem(row));
  return columns;
}

export async function getLeadHistory(
  user: UserContext,
  id: string,
): Promise<LeadStatusEventDTO[]> {
  await getLead(user, id); // permission + ownership + existence
  const rows = await repo.findHistory(id);
  return rows.map((e) => ({
    id: e.id,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    reason: e.reason,
    byUser: e.byUser,
    occurredAt: e.occurredAt,
  }));
}

// ─── Writes ───────────────────────────────────────────────────────────────────

function buildWritableData(input: CreateLeadInput | UpdateLeadInput) {
  const phone = normalizePakistaniPhone(input.contactPhone);
  return {
    contactName: input.contactName,
    contactPhone: phone,
    contactEmail: input.contactEmail ?? null,
    source: input.source ?? null,
    destination: input.destination ?? null,
    tripPurpose: input.tripPurpose ?? null,
    routeShape: input.routeShape ?? null,
    pax: input.pax ?? null,
    budgetPaisa: input.budget ?? null,
    travelDate: input.travelDate ?? null,
  };
}

export async function createLead(
  user: UserContext,
  input: CreateLeadInput,
): Promise<LeadDTO> {
  requirePermission(user, "leads:create");

  const assignedAgentId =
    input.assignedAgentId ?? (user.role === "AGENT" ? user.id : undefined);

  const data = buildWritableData(input);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.create",
      entity: "Lead",
      before: null,
      entityIdFromResult: (r: LeadDTO) => r.id,
      afterFromResult: (r: LeadDTO) => r,
    },
    async (tx) => {
      const record = await repo.create(
        {
          ...data,
          ...(input.customerId ? { customer: { connect: { id: input.customerId } } } : {}),
          ...(assignedAgentId ? { assignedAgent: { connect: { id: assignedAgentId } } } : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function updateLead(
  user: UserContext,
  id: string,
  input: UpdateLeadInput,
): Promise<LeadDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Lead not found");
  requirePermission(user, "leads:update", existing);

  const data = buildWritableData(input);
  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.update",
      entity: "Lead",
      before,
      entityIdFromResult: (r: LeadDTO) => r.id,
      afterFromResult: (r: LeadDTO) => r,
    },
    async (tx) => {
      const record = await repo.update(
        id,
        {
          ...data,
          customer: input.customerId
            ? { connect: { id: input.customerId } }
            : { disconnect: true },
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function changeStatus(
  user: UserContext,
  id: string,
  input: ChangeLeadStatusInput,
): Promise<LeadDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Lead not found");
  requirePermission(user, "leads:update", existing);

  const target = input.status;
  if (target === "BOOKED") {
    throw new ValidationError(
      "A lead becomes BOOKED only by converting it to a booking.",
      "status",
    );
  }
  if (target === "TRAVELLED" && existing.status !== "BOOKED") {
    throw new ValidationError(
      "A lead can only be marked TRAVELLED after it is BOOKED.",
      "status",
    );
  }
  if (target === "LOST" && !input.lostReason) {
    throw new ValidationError("A reason is required when marking a lead LOST.", "lostReason");
  }

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.changeStatus",
      entity: "Lead",
      before,
      entityIdFromResult: (r: LeadDTO) => r.id,
      afterFromResult: (r: LeadDTO) => r,
    },
    async (tx) => {
      const data: Prisma.LeadUpdateInput = {
        status: target,
        lostReason: target === "LOST" ? input.lostReason : null,
        lostNotes: target === "LOST" ? (input.lostNotes ?? null) : null,
      };
      const updated = await repo.updateWithOcc(id, input.version, data, tx);
      if (!updated) {
        throw new ConflictError(
          "This lead was changed by someone else. Refresh and try again.",
        );
      }
      await repo.createStatusEvent(
        {
          lead: { connect: { id } },
          fromStatus: existing.status,
          toStatus: target,
          reason: input.lostNotes ?? null,
          byUser: { connect: { id: user.id } },
        },
        tx,
      );
      return toDTO(updated);
    },
  );
}

export async function assignLead(
  user: UserContext,
  id: string,
  input: AssignLeadInput,
): Promise<LeadDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Lead not found");
  requirePermission(user, "leads:assign");

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.assign",
      entity: "Lead",
      before,
      entityIdFromResult: (r: LeadDTO) => r.id,
      afterFromResult: (r: LeadDTO) => r,
    },
    async (tx) => {
      const updated = await repo.updateWithOcc(
        id,
        input.version,
        { assignedAgent: { connect: { id: input.assignedAgentId } } },
        tx,
      );
      if (!updated) {
        throw new ConflictError(
          "This lead was changed by someone else. Refresh and try again.",
        );
      }
      return toDTO(updated);
    },
  );
}

export async function deleteLead(user: UserContext, id: string): Promise<LeadDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Lead not found");
  requirePermission(user, "leads:delete", existing);

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.delete",
      entity: "Lead",
      before,
      entityIdFromResult: (r: LeadDTO) => r.id,
      afterFromResult: (r: LeadDTO) => r,
    },
    async (tx) => toDTO(await repo.softDelete(id, tx)),
  );
}

export async function restoreLead(user: UserContext, id: string): Promise<LeadDTO> {
  const existing = await repo.findById(id, { includeDeleted: true });
  if (!existing) throw new NotFoundError("Lead not found");
  if (!existing.deletedAt) throw new ValidationError("Lead is not deleted");
  requirePermission(user, "leads:delete");

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.restore",
      entity: "Lead",
      before,
      entityIdFromResult: (r: LeadDTO) => r.id,
      afterFromResult: (r: LeadDTO) => r,
    },
    async (tx) => toDTO(await repo.restore(id, tx)),
  );
}

/**
 * Convert a lead to a customer + booking, atomically.
 *   - Links an existing customer (by lead.customerId or matching phone) or
 *     creates one from the lead's contact details.
 *   - Mints a BK-YYYY-NNNNNN number from `booking_number_seq`.
 *   - Advances the lead to BOOKED (OCC) — the only path to BOOKED.
 *   - Records a status event + a NOTE interaction trail.
 */
export async function convertLead(
  user: UserContext,
  id: string,
  input: ConvertLeadInput,
): Promise<ConvertResult> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Lead not found");
  requirePermission(user, "leads:convert", existing);

  if (existing.status === "BOOKED" || existing.status === "TRAVELLED") {
    throw new ValidationError("This lead has already been converted.");
  }
  if (existing.status === "LOST") {
    throw new ValidationError("A lost lead cannot be converted.");
  }

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "lead.convert",
      entity: "Lead",
      before,
      entityIdFromResult: (r: ConvertResult) => r.lead.id,
      afterFromResult: (r: ConvertResult) => r.lead,
    },
    async (tx) => {
      // 1) Resolve or create the customer.
      let customerId = existing.customerId;
      if (!customerId) {
        const match = await tx.customer.findFirst({
          where: { phone: existing.contactPhone, deletedAt: null },
          select: { id: true },
        });
        if (match) {
          customerId = match.id;
        } else {
          const created = await tx.customer.create({
            data: {
              name: existing.contactName,
              phone: existing.contactPhone,
              email: existing.contactEmail,
              ...(existing.assignedAgentId
                ? { assignedAgent: { connect: { id: existing.assignedAgentId } } }
                : {}),
            },
            select: { id: true },
          });
          customerId = created.id;
        }
      }

      // 2) Mint the booking number from the shared sequence helper.
      const bookingNumber = await nextDocumentNumber(
        "booking",
        tx,
        existing.travelDate ?? new Date(),
      );
      const totalPricePaisa = input.totalPrice ?? existing.budgetPaisa ?? 0n;

      const booking = await tx.booking.create({
        data: {
          bookingNumber,
          customer: { connect: { id: customerId } },
          lead: { connect: { id: existing.id } },
          travelDate: existing.travelDate,
          status: "PENDING",
          totalPricePaisa,
        },
        select: { id: true },
      });

      // 3) Advance the lead to BOOKED (only path) under OCC.
      const updated = await repo.updateWithOcc(
        existing.id,
        input.version,
        { status: "BOOKED", customer: { connect: { id: customerId } } },
        tx,
      );
      if (!updated) {
        throw new ConflictError(
          "This lead was changed by someone else. Refresh and try again.",
        );
      }

      // 4) Trail: status event + NOTE interaction.
      await repo.createStatusEvent(
        {
          lead: { connect: { id: existing.id } },
          fromStatus: existing.status,
          toStatus: "BOOKED",
          reason: `Converted to booking ${bookingNumber}`,
          byUser: { connect: { id: user.id } },
        },
        tx,
      );
      await tx.interaction.create({
        data: {
          lead: { connect: { id: existing.id } },
          type: "NOTE",
          body: `Lead converted to a customer and booking ${bookingNumber}.`,
          createdBy: { connect: { id: user.id } },
        },
      });

      return { lead: toDTO(updated), customerId, bookingId: booking.id, bookingNumber };
    },
  );
}
