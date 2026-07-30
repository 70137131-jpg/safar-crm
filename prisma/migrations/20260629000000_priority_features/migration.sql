-- Priority-feature foundations: idempotent scheduled email and import history.
ALTER TABLE "EmailOutbox" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "EmailOutbox_dedupeKey_key" ON "EmailOutbox"("dedupeKey");

CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "ImportRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "status" "ImportRunStatus" NOT NULL DEFAULT 'RUNNING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImportRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ImportRun_createdAt_idx" ON "ImportRun"("createdAt" DESC);
CREATE INDEX "ImportRun_createdById_createdAt_idx" ON "ImportRun"("createdById", "createdAt" DESC);
