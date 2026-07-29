import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { NotFoundError } from "@/lib/errors";
import * as tasksService from "@/modules/tasks/tasks.service";
import * as quotationsService from "@/modules/quotations/quotations.service";
import { getNotificationConfig } from "@/modules/settings/settings.service";
import { getNotificationRiskSnapshot } from "@/modules/ai-enhancements/ai-enhancements.service";
import * as repo from "./assistant-notifications.repository";
import type {
  AssistantNotificationDTO,
  AssistantNotificationListDTO,
} from "./assistant-notifications.types";

const MAX_ALERTS_PER_TYPE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDTO(row: Awaited<ReturnType<typeof repo.listRecent>>[number]): AssistantNotificationDTO {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function dateLabel(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Materializes current, permission-scoped operational alerts when the bell is
 * refreshed. Existing CRM services remain the only path to CRM records.
 */
export async function syncNotifications(user: UserContext): Promise<void> {
  requirePermission(user, "assistant:use");
  const config = await getNotificationConfig();
  const [tasks, quotations, risks] = await Promise.all([
    config.notifyOverdueTasks
      ? tasksService.listTasks(user, {
          page: 1,
          pageSize: MAX_ALERTS_PER_TYPE,
          status: "OPEN",
          mine: true,
        })
      : Promise.resolve({ items: [] }),
    config.notifyQuotationExpiry
      ? quotationsService.listQuotations(user, {
          page: 1,
          pageSize: MAX_ALERTS_PER_TYPE,
          sortBy: "validTill",
          sortOrder: "asc",
          status: "SENT",
        })
      : Promise.resolve({ items: [] }),
    getNotificationRiskSnapshot(user, {
      includeDocuments: config.notifyPassportExpiry,
      documentDays: config.passportExpiryWarnDays,
      includePayments: config.notifyPaymentDue,
      paymentDays: config.paymentDueWarnDays,
    }),
  ]);

  const now = new Date();
  const quotationWindow = new Date(now.getTime() + config.quotationExpiryWarnDays * MS_PER_DAY);
  const dueTasks = tasks.items.filter((task) => task.dueDate <= now);
  const expiringQuotations = quotations.items.filter(
    (quotation) =>
      quotation.validTill && quotation.validTill >= now && quotation.validTill <= quotationWindow,
  );
  const activeKeys: string[] = [];
  const alerts: repo.NotificationUpsertInput[] = [
    ...dueTasks.map((task) => {
      const dedupeKey = `task-due:${task.id}`;
      activeKeys.push(dedupeKey);
      return {
        userId: user.id,
        kind: "TASK_DUE" as const,
        title: "Task needs attention",
        body: `${task.title} was due on ${dateLabel(task.dueDate)}.`,
        href: "/tasks",
        dedupeKey,
      };
    }),
    ...expiringQuotations.map((quotation) => {
      const dedupeKey = `quotation-expiring:${quotation.id}`;
      activeKeys.push(dedupeKey);
      return {
        userId: user.id,
        kind: "QUOTATION_EXPIRING" as const,
        title: "Quotation expiring soon",
        body: `${quotation.quoteNumber ?? "Draft quotation"} expires on ${dateLabel(
          quotation.validTill!,
        )}.`,
        href: `/quotations/${quotation.id}`,
        dedupeKey,
      };
    }),
    ...risks.documents.map((document) => {
      const dedupeKey = `document-expiring:${document.id}`;
      activeKeys.push(dedupeKey);
      return {
        userId: user.id,
        kind: "DOCUMENT_EXPIRING" as const,
        title: `${document.type.toLowerCase()} expiring`,
        body: `${document.customerName}'s document expires on ${dateLabel(document.expiryDate)}.`,
        href: document.href,
        dedupeKey,
      };
    }),
    ...risks.payments.map((payment) => {
      const dedupeKey = `payment-risk:${payment.id}`;
      activeKeys.push(dedupeKey);
      return {
        userId: user.id,
        kind: "PAYMENT_RISK" as const,
        title: "Payment due before travel",
        body: `${payment.bookingNumber} has an outstanding balance and travels on ${dateLabel(payment.travelDate)}.`,
        href: payment.href,
        dedupeKey,
      };
    }),
  ];

  if (config.notifyDailySummary && activeKeys.length > 0) {
    alerts.push({
      userId: user.id,
      kind: "DAILY_BRIEF",
      title: "Your Ask Safar brief is ready",
      body: `${activeKeys.length} operational item${activeKeys.length === 1 ? "" : "s"} need attention.`,
      href: "/assistant",
      dedupeKey: `daily-brief:${dateLabel(now)}`,
    });
  }

  await repo.createNotifications(alerts);
  await repo.markStaleOperationalRead(user.id, activeKeys);
}

export async function listNotifications(user: UserContext): Promise<AssistantNotificationListDTO> {
  requirePermission(user, "assistant:use");
  await syncNotifications(user);
  const [items, unreadCount] = await Promise.all([
    repo.listRecent(user.id),
    repo.countUnread(user.id),
  ]);
  return { items: items.map(toDTO), unreadCount };
}

export async function markNotificationRead(user: UserContext, id: string): Promise<void> {
  requirePermission(user, "assistant:use");
  const result = await repo.markRead(user.id, id);
  if (result.count !== 1) throw new NotFoundError("Notification not found");
}

export async function markAllNotificationsRead(user: UserContext): Promise<void> {
  requirePermission(user, "assistant:use");
  await repo.markAllRead(user.id);
}

export async function notifyActionCompleted(
  user: UserContext,
  input: { proposalId: string; entity: string; entityId: string },
): Promise<void> {
  requirePermission(user, "assistant:use");
  const href =
    input.entity === "Lead"
      ? `/leads/${input.entityId}`
      : input.entity === "Quotation"
        ? `/quotations/${input.entityId}`
        : input.entity === "Task"
          ? "/tasks"
          : "/assistant";
  await repo.upsertNotification({
    userId: user.id,
    kind: "ACTION_COMPLETED",
    title: "Ask Safar action completed",
    body: `${input.entity} was updated after your confirmation.`,
    href,
    dedupeKey: `proposal-completed:${input.proposalId}`,
  });
}
