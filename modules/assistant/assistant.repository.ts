import type { AiMessageRole, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function createConversation(userId: string, title: string) {
  return db.aiConversation.create({
    data: { userId, title },
  });
}

export async function findOwnedConversation(id: string, userId: string) {
  return db.aiConversation.findFirst({
    where: { id, userId },
  });
}

export async function listMessages(conversationId: string, limit = 16) {
  const rows = await db.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.reverse();
}

export async function addMessage(
  conversationId: string,
  role: AiMessageRole,
  content: string,
  metadata?: {
    model?: string;
    toolNames?: string[];
    sourcePaths?: string[];
  },
) {
  return db.aiMessage.create({
    data: { conversationId, role, content, ...metadata },
  });
}

export async function touchConversation(id: string) {
  await db.aiConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
}

export async function createProposal(input: {
  conversationId: string;
  userId: string;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
  expiresAt: Date;
}) {
  return db.aiActionProposal.create({
    data: {
      ...input,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}

export async function findOwnedProposal(id: string, userId: string) {
  return db.aiActionProposal.findFirst({
    where: { id, userId },
  });
}

export async function claimProposal(id: string, userId: string): Promise<boolean> {
  const result = await db.aiActionProposal.updateMany({
    where: {
      id,
      userId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    data: { status: "PROCESSING" },
  });
  return result.count === 1;
}

export async function completeProposal(id: string) {
  return db.aiActionProposal.update({
    where: { id },
    data: { status: "EXECUTED", executedAt: new Date() },
  });
}

export async function releaseProposal(id: string) {
  return db.aiActionProposal.updateMany({
    where: { id, status: "PROCESSING" },
    data: { status: "PENDING" },
  });
}

export async function rejectProposal(id: string, userId: string) {
  return db.aiActionProposal.updateMany({
    where: { id, userId, status: "PENDING" },
    data: { status: "REJECTED" },
  });
}

export async function expireProposal(id: string) {
  return db.aiActionProposal.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
}
