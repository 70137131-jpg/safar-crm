-- Ask Safar: staff-owned conversation history and confirmation-gated actions.
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AiProposalStatus" AS ENUM ('PENDING', 'PROCESSING', 'EXECUTED', 'REJECTED', 'EXPIRED');
CREATE TYPE "AiNotificationKind" AS ENUM ('DAILY_BRIEF', 'TASK_DUE', 'QUOTATION_EXPIRING', 'ACTION_COMPLETED');

CREATE TABLE "AiConversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "toolNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourcePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiActionProposal" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AiProposalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "executedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AiActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiNotification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "AiNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AiNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiConversation_userId_updatedAt_idx"
  ON "AiConversation"("userId", "updatedAt" DESC);
CREATE INDEX "AiMessage_conversationId_createdAt_idx"
  ON "AiMessage"("conversationId", "createdAt");
CREATE INDEX "AiActionProposal_userId_status_expiresAt_idx"
  ON "AiActionProposal"("userId", "status", "expiresAt");
CREATE INDEX "AiActionProposal_conversationId_createdAt_idx"
  ON "AiActionProposal"("conversationId", "createdAt");
CREATE UNIQUE INDEX "AiNotification_userId_dedupeKey_key"
  ON "AiNotification"("userId", "dedupeKey");
CREATE INDEX "AiNotification_userId_readAt_createdAt_idx"
  ON "AiNotification"("userId", "readAt", "createdAt" DESC);

ALTER TABLE "AiConversation"
  ADD CONSTRAINT "AiConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiMessage"
  ADD CONSTRAINT "AiMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiActionProposal"
  ADD CONSTRAINT "AiActionProposal_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiActionProposal"
  ADD CONSTRAINT "AiActionProposal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiNotification"
  ADD CONSTRAINT "AiNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
