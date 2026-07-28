import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "@/lib/permissions/types";

const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listQuotations: vi.fn(),
  getNotificationConfig: vi.fn(),
  upsertNotification: vi.fn(),
  createNotifications: vi.fn(),
  markStaleOperationalRead: vi.fn(),
  listRecent: vi.fn(),
  countUnread: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock("@/modules/tasks/tasks.service", () => ({ listTasks: mocks.listTasks }));
vi.mock("@/modules/quotations/quotations.service", () => ({
  listQuotations: mocks.listQuotations,
}));
vi.mock("@/modules/settings/settings.service", () => ({
  getNotificationConfig: mocks.getNotificationConfig,
}));
vi.mock("@/modules/assistant/assistant-notifications.repository", () => ({
  upsertNotification: mocks.upsertNotification,
  createNotifications: mocks.createNotifications,
  markStaleOperationalRead: mocks.markStaleOperationalRead,
  listRecent: mocks.listRecent,
  countUnread: mocks.countUnread,
  markRead: mocks.markRead,
  markAllRead: mocks.markAllRead,
}));

import {
  listNotifications,
  markNotificationRead,
  notifyActionCompleted,
  syncNotifications,
} from "@/modules/assistant/assistant-notifications.service";

const user: UserContext = {
  id: "user-42",
  role: "AGENT",
  name: "Agent",
  email: "agent@example.com",
};

describe("Ask Safar notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    mocks.getNotificationConfig.mockResolvedValue({
      notifyPassportExpiry: true,
      notifyPaymentDue: true,
      notifyDailySummary: true,
      notifyQuotationExpiry: true,
      notifyOverdueTasks: true,
      passportExpiryWarnDays: 180,
      paymentDueWarnDays: 7,
      quotationExpiryWarnDays: 3,
      overdueTaskWarnDays: 1,
    });
    mocks.listTasks.mockResolvedValue({
      items: [
        {
          id: "task-due",
          title: "Call traveller",
          dueDate: new Date("2026-07-27T12:00:00.000Z"),
          status: "OPEN",
          type: "FOLLOW_UP",
        },
        {
          id: "task-future",
          title: "Future task",
          dueDate: new Date("2026-07-30T12:00:00.000Z"),
          status: "OPEN",
          type: "FOLLOW_UP",
        },
      ],
    });
    mocks.listQuotations.mockResolvedValue({
      items: [
        {
          id: "quote-expiring",
          quoteNumber: "Q-100",
          validTill: new Date("2026-07-30T12:00:00.000Z"),
          status: "SENT",
        },
        {
          id: "quote-later",
          quoteNumber: "Q-200",
          validTill: new Date("2026-08-10T12:00:00.000Z"),
          status: "SENT",
        },
      ],
    });
    mocks.upsertNotification.mockResolvedValue({});
    mocks.createNotifications.mockResolvedValue(0);
    mocks.markStaleOperationalRead.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("materializes only current alerts through permission-aware service calls", async () => {
    await syncNotifications(user);

    expect(mocks.listTasks).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ mine: true, status: "OPEN" }),
    );
    expect(mocks.listQuotations).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ status: "SENT" }),
    );
    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: user.id,
          kind: "TASK_DUE",
          dedupeKey: "task-due:task-due",
        }),
        expect.objectContaining({
          userId: user.id,
          kind: "QUOTATION_EXPIRING",
          dedupeKey: "quotation-expiring:quote-expiring",
        }),
      ]),
    );
    expect(mocks.createNotifications).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ dedupeKey: "task-due:task-future" })]),
    );
    expect(mocks.markStaleOperationalRead).toHaveBeenCalledWith(user.id, [
      "task-due:task-due",
      "quotation-expiring:quote-expiring",
    ]);
  });

  it("deduplicates a daily brief per user and calendar day", async () => {
    await syncNotifications(user);

    expect(mocks.createNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          userId: user.id,
          kind: "DAILY_BRIEF",
          title: "Your Ask Safar brief is ready",
          body: "2 operational items need attention.",
          href: "/assistant",
          dedupeKey: "daily-brief:2026-07-28",
        },
      ]),
    );
  });

  it("reads and marks notifications only through the signed-in user's scope", async () => {
    mocks.listRecent.mockResolvedValue([]);
    mocks.countUnread.mockResolvedValue(0);
    mocks.markRead.mockResolvedValue({ count: 1 });

    await listNotifications(user);
    await markNotificationRead(user, "11111111-1111-4111-8111-111111111111");

    expect(mocks.listRecent).toHaveBeenCalledWith(user.id);
    expect(mocks.countUnread).toHaveBeenCalledWith(user.id);
    expect(mocks.markRead).toHaveBeenCalledWith(user.id, "11111111-1111-4111-8111-111111111111");
  });

  it("creates a minimal deduplicated completion alert after a confirmed action", async () => {
    await notifyActionCompleted(user, {
      proposalId: "proposal-1",
      entity: "Quotation",
      entityId: "quote-1",
    });

    expect(mocks.upsertNotification).toHaveBeenCalledWith({
      userId: user.id,
      kind: "ACTION_COMPLETED",
      title: "Ask Safar action completed",
      body: "Quotation was updated after your confirmation.",
      href: "/quotations/quote-1",
      dedupeKey: "proposal-completed:proposal-1",
    });
  });
});
