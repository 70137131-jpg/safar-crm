import { z } from "zod";
import { AI_PROPOSAL_TYPES } from "./assistant.types";

export const assistantChatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

export const assistantConversationIdSchema = z.string().uuid();

export const assistantProposalActionSchema = z.object({
  action: z.enum(["confirm", "reject"]),
});

export const assistantProposalTypeSchema = z.enum(AI_PROPOSAL_TYPES);

export const searchLeadsToolSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export const reportQuestionToolSchema = z.object({
  question: z.string().trim().min(3).max(500),
});

export const draftFollowUpToolSchema = z.object({
  targetType: z.enum(["lead", "customer"]),
  targetId: z.string().uuid(),
  channel: z.enum(["WHATSAPP", "EMAIL"]),
  language: z.enum(["ENGLISH", "URDU", "ROMAN_URDU"]).default("ENGLISH"),
  tone: z.string().trim().min(1).max(40).default("friendly"),
  purpose: z.string().trim().max(300).optional(),
});

export const idToolSchema = z.object({
  id: z.string().uuid(),
});

export const bookingBalanceToolSchema = z.object({
  bookingId: z.string().uuid(),
});

export const expiringQuotationsToolSchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export const emptyToolSchema = z.object({}).passthrough();

const proposalSummarySchema = z.string().trim().min(1).max(300);

const taskProposalFields = {
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().datetime(),
  type: z.enum(["FOLLOW_UP", "PASSPORT_EXPIRY", "PAYMENT_DUE", "OTHER"]).default("FOLLOW_UP"),
  leadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
} as const;

export const taskProposalPayloadSchema = z
  .object(taskProposalFields)
  .refine((value) => value.leadId || value.customerId || value.bookingId, {
    message: "A task proposal needs a lead, customer, or booking.",
  });
export const proposeTaskToolSchema = z
  .object({
    summary: proposalSummarySchema,
    ...taskProposalFields,
  })
  .refine((value) => value.leadId || value.customerId || value.bookingId, {
    message: "A task proposal needs a lead, customer, or booking.",
  });

const interactionProposalFields = {
  type: z.enum(["CALL", "WHATSAPP", "EMAIL", "MEETING", "NOTE"]),
  body: z.string().trim().min(1).max(20000),
  leadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
} as const;
export const interactionProposalPayloadSchema = z
  .object(interactionProposalFields)
  .refine((value) => value.leadId || value.customerId, {
    message: "An interaction proposal needs a lead or customer.",
  });
export const proposeInteractionToolSchema = z
  .object({
    summary: proposalSummarySchema,
    ...interactionProposalFields,
  })
  .refine((value) => value.leadId || value.customerId, {
    message: "An interaction proposal needs a lead or customer.",
  });

export const leadStatusProposalPayloadSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(["NEW", "CONTACTED", "QUOTATION_SENT", "NEGOTIATING", "TRAVELLED", "LOST"]),
  version: z.coerce.number().int().min(0),
  lostReason: z
    .enum(["PRICE", "COMPETITOR", "NO_RESPONSE", "CHANGED_PLANS", "NO_VISA", "OTHER"])
    .optional(),
  lostNotes: z.string().trim().max(2000).optional(),
});
export const proposeLeadStatusToolSchema = leadStatusProposalPayloadSchema.extend({
  summary: proposalSummarySchema,
});

const quotationProposalFields = {
  customerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  validTill: z.string().date().optional(),
  discount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default("0"),
  notes: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        quantity: z.coerce.number().int().min(1).max(9999),
        unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
      }),
    )
    .min(1)
    .max(100),
} as const;
export const quotationProposalPayloadSchema = z
  .object(quotationProposalFields)
  .refine((value) => value.customerId || value.leadId, {
    message: "A quotation proposal needs a customer or lead.",
  });
export const proposeQuotationToolSchema = z
  .object({
    summary: proposalSummarySchema,
    ...quotationProposalFields,
  })
  .refine((value) => value.customerId || value.leadId, {
    message: "A quotation proposal needs a customer or lead.",
  });
