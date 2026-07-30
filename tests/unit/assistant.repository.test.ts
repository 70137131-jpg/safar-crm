import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  aiConversation: {
    findFirst: vi.fn(),
  },
  aiActionProposal: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  aiNotification: {
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  claimProposal,
  findOwnedConversation,
  findOwnedProposal,
} from "@/modules/assistant/assistant.repository";
import { markRead as markNotificationRead } from "@/modules/assistant/assistant-notifications.repository";

describe("assistant repository ownership boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always scopes conversation lookups to the authenticated user", async () => {
    dbMock.aiConversation.findFirst.mockResolvedValue(null);

    await findOwnedConversation("conversation-1", "user-42");

    expect(dbMock.aiConversation.findFirst).toHaveBeenCalledWith({
      where: { id: "conversation-1", userId: "user-42" },
    });
  });

  it("always scopes proposal reads and claims to the authenticated user", async () => {
    dbMock.aiActionProposal.findFirst.mockResolvedValue(null);
    dbMock.aiActionProposal.updateMany.mockResolvedValue({ count: 0 });

    await findOwnedProposal("proposal-1", "user-42");
    await claimProposal("proposal-1", "user-42");

    expect(dbMock.aiActionProposal.findFirst).toHaveBeenCalledWith({
      where: { id: "proposal-1", userId: "user-42" },
    });
    expect(dbMock.aiActionProposal.updateMany).toHaveBeenCalledWith({
      where: {
        id: "proposal-1",
        userId: "user-42",
        status: "PENDING",
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: "PROCESSING" },
    });
  });

  it("scopes notification mutations to the authenticated user", async () => {
    dbMock.aiNotification.updateMany.mockResolvedValue({ count: 0 });

    await markNotificationRead("user-42", "notification-1");

    expect(dbMock.aiNotification.updateMany).toHaveBeenCalledWith({
      where: { id: "notification-1", userId: "user-42", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
