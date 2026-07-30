"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import { createInteractionSchema } from "./interactions.schemas";
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
