-- Safar CRM AI enhancements: structured insights, review-gated extraction,
-- communication drafts, audio analysis, and permission-isolated vector search.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE "AiNotificationKind" ADD VALUE IF NOT EXISTS 'LEAD_RISK';
ALTER TYPE "AiNotificationKind" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXPIRING';
ALTER TYPE "AiNotificationKind" ADD VALUE IF NOT EXISTS 'PAYMENT_RISK';
ALTER TYPE "AiNotificationKind" ADD VALUE IF NOT EXISTS 'DATA_QUALITY';
ALTER TYPE "AiNotificationKind" ADD VALUE IF NOT EXISTS 'FORECAST_ALERT';
ALTER TYPE "AiNotificationKind" ADD VALUE IF NOT EXISTS 'INSIGHT_READY';

CREATE TYPE "AiInsightKind" AS ENUM (
  'LEAD_SCORE',
  'MANAGER_BRIEF',
  'PACKAGE_RECOMMENDATION',
  'QUOTE_REVIEW',
  'DATA_QUALITY',
  'FORECAST'
);
CREATE TYPE "AiInsightStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'APPLIED');
CREATE TYPE "AiDraftChannel" AS ENUM ('WHATSAPP', 'EMAIL');
CREATE TYPE "AiDraftLanguage" AS ENUM ('ENGLISH', 'URDU', 'ROMAN_URDU');
CREATE TYPE "AiReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPLIED', 'REJECTED');
CREATE TYPE "AiMediaKind" AS ENUM ('VOICE_NOTE', 'CALL_RECORDING');

CREATE TABLE "AiInsight" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "kind" "AiInsightKind" NOT NULL,
  "status" "AiInsightStatus" NOT NULL DEFAULT 'ACTIVE',
  "dedupeKey" TEXT NOT NULL,
  "subjectType" TEXT,
  "subjectId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "score" INTEGER,
  "confidence" INTEGER,
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "payload" JSONB NOT NULL,
  "sourcePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiInsight_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "AiInsight_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 100))
);

CREATE TABLE "AiCommunicationDraft" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "leadId" UUID,
  "customerId" UUID,
  "channel" "AiDraftChannel" NOT NULL,
  "language" "AiDraftLanguage" NOT NULL,
  "tone" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AiCommunicationDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiCommunicationDraft_target" CHECK (
    (("leadId" IS NOT NULL)::int + ("customerId" IS NOT NULL)::int) = 1
  )
);

CREATE TABLE "AiDocumentExtraction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "AiReviewStatus" NOT NULL DEFAULT 'PENDING',
  "extracted" JSONB NOT NULL,
  "confidence" INTEGER,
  "model" TEXT,
  "reviewedAt" TIMESTAMPTZ(6),
  "appliedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AiDocumentExtraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiDocumentExtraction_confidence_range" CHECK (
    "confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 100)
  )
);

CREATE TABLE "AiMediaAnalysis" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "kind" "AiMediaKind" NOT NULL,
  "transcript" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "sentiment" TEXT,
  "speakers" JSONB,
  "actionItems" JSONB NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AiMediaAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeChunk" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "indexedByUserId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "embedding" vector(768) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AiKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiInsight_userId_dedupeKey_key"
  ON "AiInsight"("userId", "dedupeKey");
CREATE INDEX "AiInsight_userId_kind_status_updatedAt_idx"
  ON "AiInsight"("userId", "kind", "status", "updatedAt" DESC);
CREATE INDEX "AiInsight_subjectType_subjectId_idx"
  ON "AiInsight"("subjectType", "subjectId");
CREATE INDEX "AiCommunicationDraft_userId_createdAt_idx"
  ON "AiCommunicationDraft"("userId", "createdAt" DESC);
CREATE INDEX "AiCommunicationDraft_leadId_idx" ON "AiCommunicationDraft"("leadId");
CREATE INDEX "AiCommunicationDraft_customerId_idx" ON "AiCommunicationDraft"("customerId");
CREATE INDEX "AiDocumentExtraction_documentId_createdAt_idx"
  ON "AiDocumentExtraction"("documentId", "createdAt" DESC);
CREATE INDEX "AiDocumentExtraction_userId_status_createdAt_idx"
  ON "AiDocumentExtraction"("userId", "status", "createdAt" DESC);
CREATE INDEX "AiMediaAnalysis_documentId_createdAt_idx"
  ON "AiMediaAnalysis"("documentId", "createdAt" DESC);
CREATE INDEX "AiMediaAnalysis_userId_createdAt_idx"
  ON "AiMediaAnalysis"("userId", "createdAt" DESC);
CREATE UNIQUE INDEX "AiKnowledgeChunk_indexedByUserId_entityType_entityId_key"
  ON "AiKnowledgeChunk"("indexedByUserId", "entityType", "entityId");
CREATE INDEX "AiKnowledgeChunk_indexedByUserId_updatedAt_idx"
  ON "AiKnowledgeChunk"("indexedByUserId", "updatedAt" DESC);
CREATE INDEX "AiKnowledgeChunk_embedding_hnsw_idx"
  ON "AiKnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "AiInsight"
  ADD CONSTRAINT "AiInsight_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCommunicationDraft"
  ADD CONSTRAINT "AiCommunicationDraft_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCommunicationDraft"
  ADD CONSTRAINT "AiCommunicationDraft_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiCommunicationDraft"
  ADD CONSTRAINT "AiCommunicationDraft_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiDocumentExtraction"
  ADD CONSTRAINT "AiDocumentExtraction_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiDocumentExtraction"
  ADD CONSTRAINT "AiDocumentExtraction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiMediaAnalysis"
  ADD CONSTRAINT "AiMediaAnalysis_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiMediaAnalysis"
  ADD CONSTRAINT "AiMediaAnalysis_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiKnowledgeChunk"
  ADD CONSTRAINT "AiKnowledgeChunk_indexedByUserId_fkey"
  FOREIGN KEY ("indexedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
