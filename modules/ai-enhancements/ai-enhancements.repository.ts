import type {
  AiDraftChannel,
  AiDraftLanguage,
  AiInsightKind,
  AiMediaKind,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";

export async function listActiveAssistantUsers() {
  return db.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, email: true, name: true, role: true },
    take: 1000,
  });
}

export async function upsertInsight(input: {
  userId: string;
  kind: AiInsightKind;
  dedupeKey: string;
  subjectType?: string;
  subjectId?: string;
  title: string;
  summary: string;
  score?: number;
  confidence?: number;
  reasons?: string[];
  payload: Prisma.InputJsonValue;
  sourcePaths?: string[];
  expiresAt?: Date;
}) {
  const { userId, dedupeKey, ...data } = input;
  return db.aiInsight.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    create: { userId, dedupeKey, ...data },
    update: { ...data, status: "ACTIVE" },
  });
}

export async function listRecentInsights(userId: string, take = 30) {
  return db.aiInsight.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function createDraft(input: {
  userId: string;
  leadId?: string;
  customerId?: string;
  channel: AiDraftChannel;
  language: AiDraftLanguage;
  tone: string;
  subject?: string | null;
  body: string;
  model?: string;
}) {
  return db.aiCommunicationDraft.create({ data: input });
}

export async function createExtraction(input: {
  documentId: string;
  userId: string;
  extracted: Prisma.InputJsonValue;
  confidence?: number;
  model?: string;
}) {
  return db.aiDocumentExtraction.create({ data: input });
}

export async function reviewExtraction(
  extractionId: string,
  userId: string,
  decision: "accept" | "reject",
) {
  return db.aiDocumentExtraction.updateMany({
    where: { id: extractionId, userId, status: "PENDING" },
    data: {
      status: decision === "accept" ? "REVIEWED" : "REJECTED",
      reviewedAt: new Date(),
    },
  });
}

export async function createMediaAnalysis(input: {
  documentId: string;
  userId: string;
  kind: AiMediaKind;
  transcript: string;
  summary: string;
  sentiment?: string | null;
  speakers?: Prisma.InputJsonValue;
  actionItems: Prisma.InputJsonValue;
  model?: string;
}) {
  return db.aiMediaAnalysis.create({ data: input });
}

export async function findLeadSignals(leadId: string) {
  return db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      contactName: true,
      status: true,
      destination: true,
      budgetPaisa: true,
      travelDate: true,
      tripPurpose: true,
      pax: true,
      assignedAgentId: true,
      updatedAt: true,
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 10,
        select: { type: true, body: true, occurredAt: true },
      },
      tasks: {
        where: { status: "OPEN" },
        orderBy: { dueDate: "asc" },
        select: { id: true, title: true, dueDate: true, type: true },
      },
      quotations: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, status: true, validTill: true, totalPaisa: true },
      },
    },
  });
}

export async function findCustomerDraftContext(customerId: string) {
  return db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      nationality: true,
      assignedAgentId: true,
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 10,
        select: { type: true, body: true, occurredAt: true },
      },
      bookings: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { bookingNumber: true, status: true, travelDate: true },
      },
      quotations: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { quoteNumber: true, status: true, validTill: true, totalPaisa: true },
      },
    },
  });
}

export async function findActivePackages() {
  return db.package.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function findQuotationForReview(quotationId: string) {
  return db.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: { select: { id: true, name: true, assignedAgentId: true } },
      lead: { select: { id: true, contactName: true, assignedAgentId: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
}

export async function getDataQualitySnapshot(assignedAgentId?: string) {
  const [customers, leads, tasks] = await Promise.all([
    db.customer.findMany({
      where: { deletedAt: null, ...(assignedAgentId ? { assignedAgentId } : {}) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        nationality: true,
        passportExpiry: true,
        assignedAgentId: true,
      },
      take: 1000,
    }),
    db.lead.findMany({
      where: { deletedAt: null, ...(assignedAgentId ? { assignedAgentId } : {}) },
      select: {
        id: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        source: true,
        destination: true,
        travelDate: true,
        status: true,
        assignedAgentId: true,
      },
      take: 1000,
    }),
    db.task.findMany({
      where: {
        status: "OPEN",
        ...(assignedAgentId ? { assignedToId: assignedAgentId } : {}),
      },
      select: {
        id: true,
        title: true,
        leadId: true,
        customerId: true,
        bookingId: true,
        dueDate: true,
        lead: { select: { status: true } },
        booking: { select: { status: true } },
      },
      take: 1000,
    }),
  ]);
  return { customers, leads, tasks };
}

export async function findExpiringDocuments(from: Date, to: Date, assignedAgentId?: string) {
  return db.document.findMany({
    where: {
      expiryDate: { gte: from, lte: to },
      ...(assignedAgentId ? { customer: { assignedAgentId } } : {}),
    },
    select: {
      id: true,
      type: true,
      expiryDate: true,
      customerId: true,
      customer: { select: { name: true } },
    },
    orderBy: { expiryDate: "asc" },
    take: 100,
  });
}

export async function findBookingsAtPaymentRisk(to: Date, assignedAgentId?: string) {
  return db.booking.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PENDING", "CONFIRMED", "TICKETED"] },
      travelDate: { gte: new Date(), lte: to },
      ...(assignedAgentId ? { customer: { assignedAgentId } } : {}),
    },
    select: {
      id: true,
      bookingNumber: true,
      travelDate: true,
      totalPricePaisa: true,
      customer: { select: { name: true } },
      payments: {
        where: { status: "PAID" },
        select: { amountPaisa: true },
      },
    },
    orderBy: { travelDate: "asc" },
    take: 100,
  });
}

export async function getKnowledgeSources(assignedAgentId?: string) {
  const [leads, customers, packages, quotations] = await Promise.all([
    db.lead.findMany({
      where: { deletedAt: null, ...(assignedAgentId ? { assignedAgentId } : {}) },
      select: {
        id: true,
        contactName: true,
        status: true,
        source: true,
        destination: true,
        tripPurpose: true,
        pax: true,
        travelDate: true,
        interactions: {
          orderBy: { occurredAt: "desc" },
          take: 5,
          select: { type: true, body: true, occurredAt: true },
        },
      },
      take: 500,
    }),
    db.customer.findMany({
      where: { deletedAt: null, ...(assignedAgentId ? { assignedAgentId } : {}) },
      select: {
        id: true,
        name: true,
        nationality: true,
        interactions: {
          orderBy: { occurredAt: "desc" },
          take: 5,
          select: { type: true, body: true, occurredAt: true },
        },
      },
      take: 500,
    }),
    db.package.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        destination: true,
        description: true,
        durationDays: true,
        hotel: true,
        included: true,
        excluded: true,
      },
      take: 500,
    }),
    db.quotation.findMany({
      where: assignedAgentId
        ? {
            OR: [{ lead: { assignedAgentId } }, { customer: { assignedAgentId } }],
          }
        : {},
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        validTill: true,
        notes: true,
        customer: { select: { name: true } },
        lead: { select: { contactName: true } },
        items: { select: { description: true } },
      },
      take: 500,
    }),
  ]);
  return { leads, customers, packages, quotations };
}

export async function clearKnowledgeIndex(userId: string) {
  return db.$executeRaw`DELETE FROM "AiKnowledgeChunk" WHERE "indexedByUserId" = ${userId}::uuid`;
}

export async function upsertKnowledgeChunk(input: {
  userId: string;
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  content: string;
  contentHash: string;
  metadata: Prisma.InputJsonValue;
  embedding: number[];
}) {
  const vector = `[${input.embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
  const metadata = JSON.stringify(input.metadata);
  return db.$executeRaw`
    INSERT INTO "AiKnowledgeChunk" (
      "id", "indexedByUserId", "entityType", "entityId", title, href, content,
      "contentHash", metadata, embedding, "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${input.userId}::uuid, ${input.entityType}, ${input.entityId},
      ${input.title}, ${input.href}, ${input.content}, ${input.contentHash},
      ${metadata}::jsonb, ${vector}::vector, NOW(), NOW()
    )
    ON CONFLICT ("indexedByUserId", "entityType", "entityId")
    DO UPDATE SET
      title = EXCLUDED.title,
      href = EXCLUDED.href,
      content = EXCLUDED.content,
      "contentHash" = EXCLUDED."contentHash",
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "updatedAt" = NOW()
  `;
}

export interface KnowledgeSearchRow {
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  content: string;
  metadata: unknown;
  similarity: number;
}

export async function searchKnowledge(userId: string, embedding: number[], take = 10) {
  const vector = `[${embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
  return db.$queryRaw<KnowledgeSearchRow[]>`
    SELECT
      "entityType",
      "entityId",
      title,
      href,
      content,
      metadata,
      (1 - (embedding <=> ${vector}::vector))::float8 AS similarity
    FROM "AiKnowledgeChunk"
    WHERE "indexedByUserId" = ${userId}::uuid
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${take}
  `;
}
