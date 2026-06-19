"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  createInteractionSchema,
  updateInteractionSchema,
} from "./interactions.schemas";
import type { InteractionDTO } from "./interactions.types";
import * as service from "./interactions.service";

/**
 * Interactions server actions. requireUser() → Zod parse → service → result.
 */

export const createInteractionAction = serverAction(
  "interactions.create",
  async (formData: Record<string, unknown>): Promise<InteractionDTO> => {
    const user = await requireUser();
    return service.createInteraction(user, createInteractionSchema.parse(formData));
  },
);

export const listInteractionsByLeadAction = serverAction(
  "interactions.listByLead",
  async (leadId: string): Promise<InteractionDTO[]> => {
    const user = await requireUser();
    return service.listByLead(user, leadId);
  },
);

export const listInteractionsByCustomerAction = serverAction(
  "interactions.listByCustomer",
  async (customerId: string): Promise<InteractionDTO[]> => {
    const user = await requireUser();
    return service.listByCustomer(user, customerId);
  },
);

export const updateInteractionAction = serverAction(
  "interactions.update",
  async (id: string, formData: Record<string, unknown>): Promise<InteractionDTO> => {
    const user = await requireUser();
    return service.updateInteraction(user, id, updateInteractionSchema.parse(formData));
  },
);

export const deleteInteractionAction = serverAction(
  "interactions.delete",
  async (id: string): Promise<InteractionDTO> => {
    const user = await requireUser();
    return service.deleteInteraction(user, id);
  },
);
