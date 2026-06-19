import type { InteractionType } from "@prisma/client";

/** Interaction DTO returned by the service. */
export interface InteractionDTO {
  id: string;
  leadId: string | null;
  customerId: string | null;
  type: InteractionType;
  body: string;
  occurredAt: Date;
  createdById: string;
  createdBy: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}
