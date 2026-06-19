import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { NotFoundError, ForbiddenError, ValidationError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import * as repo from "./interactions.repository";
import * as leadsService from "@/modules/leads/leads.service";
import * as customersService from "@/modules/customers/customers.service";
import type {
  CreateInteractionInput,
  UpdateInteractionInput,
} from "./interactions.schemas";
import type { InteractionDTO } from "./interactions.types";

/**
 * Interactions service.
 *
 * Access control is delegated to the parent aggregate: an interaction is only
 * visible/editable if the user can access its lead or customer. We verify this
 * by calling the parent service's `get*` (which enforces ownership scoping),
 * keeping cross-module access at the service→service boundary. Additionally,
 * an AGENT may only edit/delete interactions they authored.
 */

type Record_ = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(r: Record_): InteractionDTO {
  return {
    id: r.id,
    leadId: r.leadId,
    customerId: r.customerId,
    type: r.type,
    body: r.body,
    occurredAt: r.occurredAt,
    createdById: r.createdById,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

async function assertParentAccess(
  user: UserContext,
  parent: { leadId?: string | null; customerId?: string | null },
): Promise<void> {
  if (parent.leadId) {
    await leadsService.getLead(user, parent.leadId);
  } else if (parent.customerId) {
    await customersService.getCustomer(user, parent.customerId);
  } else {
    throw new ValidationError("An interaction must be attached to a lead or a customer");
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listByLead(
  user: UserContext,
  leadId: string,
): Promise<InteractionDTO[]> {
  requirePermission(user, "interactions:view");
  await leadsService.getLead(user, leadId); // access check
  return (await repo.findByLead(leadId)).map(toDTO);
}

export async function listByCustomer(
  user: UserContext,
  customerId: string,
): Promise<InteractionDTO[]> {
  requirePermission(user, "interactions:view");
  await customersService.getCustomer(user, customerId); // access check
  return (await repo.findByCustomer(customerId)).map(toDTO);
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createInteraction(
  user: UserContext,
  input: CreateInteractionInput,
): Promise<InteractionDTO> {
  requirePermission(user, "interactions:create");
  await assertParentAccess(user, input);

  return withAudit(
    {
      ...auditContext(user),
      action: "interaction.create",
      entity: "Interaction",
      before: null,
      entityIdFromResult: (r: InteractionDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.create(
        {
          type: input.type,
          body: input.body,
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
          createdBy: { connect: { id: user.id } },
          ...(input.leadId ? { lead: { connect: { id: input.leadId } } } : {}),
          ...(input.customerId ? { customer: { connect: { id: input.customerId } } } : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function updateInteraction(
  user: UserContext,
  id: string,
  input: UpdateInteractionInput,
): Promise<InteractionDTO> {
  requirePermission(user, "interactions:update");
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Interaction not found");
  await assertParentAccess(user, existing);
  if (user.role === "AGENT" && existing.createdById !== user.id) {
    throw new ForbiddenError("You can only edit interactions you created");
  }

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "interaction.update",
      entity: "Interaction",
      before,
      entityIdFromResult: (r: InteractionDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(
        id,
        {
          ...(input.type ? { type: input.type } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

export async function deleteInteraction(
  user: UserContext,
  id: string,
): Promise<InteractionDTO> {
  requirePermission(user, "interactions:delete");
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Interaction not found");
  await assertParentAccess(user, existing);
  if (user.role === "AGENT" && existing.createdById !== user.id) {
    throw new ForbiddenError("You can only delete interactions you created");
  }

  const before = toDTO(existing);

  return withAudit(
    {
      ...auditContext(user),
      action: "interaction.delete",
      entity: "Interaction",
      before,
      entityIdFromResult: (r: InteractionDTO) => r.id,
    },
    async (tx) => toDTO(await repo.remove(id, tx)),
  );
}
