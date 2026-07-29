import { z } from "zod";

const uuid = z.string().uuid();

export const aiWorkbenchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dashboard") }),
  z.object({ action: z.literal("lead_score"), leadId: uuid }),
  z.object({
    action: z.literal("follow_up"),
    targetType: z.enum(["lead", "customer"]),
    targetId: uuid,
    channel: z.enum(["WHATSAPP", "EMAIL"]),
    language: z.enum(["ENGLISH", "URDU", "ROMAN_URDU"]),
    tone: z.string().trim().min(1).max(40).default("friendly"),
    purpose: z.string().trim().max(300).optional(),
  }),
  z.object({ action: z.literal("document_extract"), documentId: uuid }),
  z.object({
    action: z.literal("review_extraction"),
    extractionId: uuid,
    decision: z.enum(["accept", "reject"]),
  }),
  z.object({
    action: z.literal("media_analyze"),
    documentId: uuid,
    kind: z.enum(["VOICE_NOTE", "CALL_RECORDING"]).default("VOICE_NOTE"),
  }),
  z.object({ action: z.literal("semantic_sync") }),
  z.object({
    action: z.literal("semantic_search"),
    query: z.string().trim().min(2).max(500),
  }),
  z.object({ action: z.literal("recommend_packages"), leadId: uuid }),
  z.object({ action: z.literal("quote_review"), quotationId: uuid }),
  z.object({ action: z.literal("data_quality") }),
  z.object({
    action: z.literal("report"),
    question: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("forecast") }),
  z.object({ action: z.literal("briefing") }),
]);

export type AiWorkbenchAction = z.infer<typeof aiWorkbenchActionSchema>;

export const followUpOutputSchema = z.object({
  subject: z.string().trim().max(200).nullable().default(null),
  body: z.string().trim().min(1).max(5000),
  rationale: z.string().trim().min(1).max(500),
});

export const documentExtractionOutputSchema = z.object({
  documentType: z.string().trim().max(80),
  confidence: z.coerce.number().int().min(0).max(100),
  fields: z.record(
    z.object({
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      confidence: z.coerce.number().int().min(0).max(100),
      evidence: z.string().trim().max(300).optional(),
    }),
  ),
  warnings: z.array(z.string().trim().max(300)).max(20).default([]),
});

export const mediaAnalysisOutputSchema = z.object({
  transcript: z.string().trim().min(1).max(50_000),
  summary: z.string().trim().min(1).max(5000),
  sentiment: z.string().trim().max(100).nullable().default(null),
  speakers: z
    .array(
      z.object({
        label: z.string().trim().max(80),
        description: z.string().trim().max(200).optional(),
      }),
    )
    .max(20)
    .default([]),
  actionItems: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        dueDate: z.string().datetime().nullable().default(null),
        owner: z.string().trim().max(100).nullable().default(null),
      }),
    )
    .max(20)
    .default([]),
  commitments: z.array(z.string().trim().max(500)).max(20).default([]),
  objections: z.array(z.string().trim().max(500)).max(20).default([]),
});

export const reportClassificationSchema = z.object({
  report: z.enum([
    "overview",
    "revenue",
    "lead-funnel",
    "agent-performance",
    "destination",
    "lead-source",
    "payments",
    "tasks",
  ]),
  days: z.coerce.number().int().min(7).max(365).default(90),
});
