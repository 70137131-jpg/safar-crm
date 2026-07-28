import type { AiNotificationKind } from "@prisma/client";
import { db } from "@/lib/db";

export interface NotificationUpsertInput {
  userId: string;
  kind: AiNotificationKind;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
}

export async function upsertNotification(input: NotificationUpsertInput) {
  const { userId, dedupeKey, ...content } = input;
  return db.aiNotification.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    create: input,
    update: content,
  });
}

export async function createNotifications(inputs: NotificationUpsertInput[]) {
  if (inputs.length === 0) return 0;
  const result = await db.aiNotification.createMany({
    data: inputs,
    skipDuplicates: true,
  });
  return result.count;
}

export async function listRecent(userId: string, take = 20) {
  return db.aiNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function countUnread(userId: string) {
  return db.aiNotification.count({
    where: { userId, readAt: null },
  });
}

export async function markRead(userId: string, id: string) {
  return db.aiNotification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  return db.aiNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markStaleOperationalRead(userId: string, activeKeys: string[]) {
  return db.aiNotification.updateMany({
    where: {
      userId,
      readAt: null,
      kind: { in: ["TASK_DUE", "QUOTATION_EXPIRING"] },
      ...(activeKeys.length > 0 ? { dedupeKey: { notIn: activeKeys } } : {}),
    },
    data: { readAt: new Date() },
  });
}
