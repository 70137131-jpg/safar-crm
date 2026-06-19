import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

/** Unit tests for the tasks service — RBAC/ownership, assignment rules, and the idempotent sweeps. */

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
}));
vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/email/outbox", () => ({ enqueueEmail: vi.fn() }));

const mockSettings = { getNotificationConfig: vi.fn() };
vi.mock("@/modules/settings/settings.service", () => mockSettings);

const mockRepo = {
  findById: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createManySkipDuplicates: vi.fn(),
  findDueForReminder: vi.fn(),
  claimReminder: vi.fn(),
  findPassportExpiryCandidates: vi.fn(),
  findPaymentDueCandidates: vi.fn(),
};
vi.mock("@/modules/tasks/tasks.repository", () => mockRepo);

const service = await import("@/modules/tasks/tasks.service");

const admin = { id: "u-admin", email: "a@s", name: "A", role: "ADMIN" as const };
const agent = { id: "agent-1", email: "g@s", name: "G", role: "AGENT" as const };
const agent2 = { id: "agent-2", email: "g2@s", name: "G2", role: "AGENT" as const };
const accountant = { id: "u-acc", email: "c@s", name: "C", role: "ACCOUNTANT" as const };

function taskRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t-1",
    title: "Follow up",
    dueDate: new Date("2026-01-10"),
    status: "OPEN",
    type: "FOLLOW_UP",
    leadId: null,
    customerId: "cust-1",
    bookingId: null,
    assignedToId: "agent-1",
    assignedTo: { id: "agent-1", name: "G" },
    doneAt: null,
    doneById: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

const allEnabled = {
  notifyPassportExpiry: true, notifyPaymentDue: true, notifyOverdueTasks: true,
  passportExpiryWarnDays: 180, paymentDueWarnDays: 7, overdueTaskWarnDays: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSettings.getNotificationConfig.mockResolvedValue(allEnabled);
});

describe("createTask assignment rules", () => {
  it("forces an AGENT's task to be assigned to themselves", async () => {
    mockRepo.create.mockResolvedValue(taskRecord());
    await service.createTask(agent, { title: "x", dueDate: new Date(), type: "FOLLOW_UP", customerId: "cust-1", assignedToId: "agent-2" } as never);
    const [data] = mockRepo.create.mock.calls[0]!;
    expect(data.assignedTo.connect.id).toBe("agent-1"); // self, not agent-2
  });

  it("lets an ADMIN assign to another user", async () => {
    mockRepo.create.mockResolvedValue(taskRecord());
    await service.createTask(admin, { title: "x", dueDate: new Date(), type: "FOLLOW_UP", customerId: "cust-1", assignedToId: "agent-2" } as never);
    const [data] = mockRepo.create.mock.calls[0]!;
    expect(data.assignedTo.connect.id).toBe("agent-2");
  });

  it("denies ACCOUNTANT (no tasks:create)", async () => {
    await expect(
      service.createTask(accountant, { title: "x", dueDate: new Date(), type: "FOLLOW_UP", customerId: "cust-1" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getTask ownership", () => {
  it("hides another agent's task as NotFound", async () => {
    mockRepo.findById.mockResolvedValue(taskRecord({ assignedToId: "agent-1" }));
    await expect(service.getTask(agent2, "t-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("completeTask", () => {
  it("marks an OPEN task DONE", async () => {
    mockRepo.findById.mockResolvedValue(taskRecord({ status: "OPEN" }));
    mockRepo.update.mockResolvedValue(taskRecord({ status: "DONE", doneAt: new Date() }));
    const r = await service.completeTask(agent, "t-1");
    expect(r.status).toBe("DONE");
  });

  it("refuses to complete an already-done task", async () => {
    mockRepo.findById.mockResolvedValue(taskRecord({ status: "DONE" }));
    await expect(service.completeTask(agent, "t-1")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("assignTask", () => {
  it("denies AGENT (no tasks:assign)", async () => {
    mockRepo.findById.mockResolvedValue(taskRecord());
    await expect(service.assignTask(agent, "t-1", { assignedToId: "agent-2" } as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("allows ADMIN", async () => {
    mockRepo.findById.mockResolvedValue(taskRecord());
    mockRepo.update.mockResolvedValue(taskRecord({ assignedToId: "agent-2" }));
    const r = await service.assignTask(admin, "t-1", { assignedToId: "agent-2" } as never);
    expect(r.assignedToId).toBe("agent-2");
  });
});

describe("listTasks scoping", () => {
  it("forces an AGENT to their own tasks", async () => {
    mockRepo.findMany.mockResolvedValue({ items: [], total: 0 });
    await service.listTasks(agent, { page: 1, pageSize: 50, mine: false } as never);
    const [filters] = mockRepo.findMany.mock.calls[0]!;
    expect(filters.assignedToId).toBe("agent-1");
  });
});

describe("sweepReminders", () => {
  it("emails a claimed due task exactly once", async () => {
    mockRepo.findDueForReminder.mockResolvedValue([
      { id: "t-1", title: "Call", dueDate: new Date("2026-01-01"), assignedTo: { id: "agent-1", name: "G", email: "g@s" } },
    ]);
    mockRepo.claimReminder.mockResolvedValue(true);
    const outbox = await import("@/lib/email/outbox");
    const r = await service.sweepReminders();
    expect(r.reminded).toBe(1);
    expect(outbox.enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a task it cannot claim (idempotent double-fire)", async () => {
    mockRepo.findDueForReminder.mockResolvedValue([
      { id: "t-1", title: "Call", dueDate: new Date(), assignedTo: { id: "agent-1", name: "G", email: "g@s" } },
    ]);
    mockRepo.claimReminder.mockResolvedValue(false);
    const outbox = await import("@/lib/email/outbox");
    const r = await service.sweepReminders();
    expect(r.reminded).toBe(0);
    expect(outbox.enqueueEmail).not.toHaveBeenCalled();
  });

  it("no-ops when reminders are disabled", async () => {
    mockSettings.getNotificationConfig.mockResolvedValue({ ...allEnabled, notifyOverdueTasks: false });
    const r = await service.sweepReminders();
    expect(r.reminded).toBe(0);
    expect(mockRepo.findDueForReminder).not.toHaveBeenCalled();
  });
});

describe("sweepPassportExpiry", () => {
  it("creates dedup-safe tasks for candidates with an agent", async () => {
    mockRepo.findPassportExpiryCandidates.mockResolvedValue([
      { id: "cust-1", name: "Ali", assignedAgentId: "agent-1", passportExpiry: new Date("2026-03-01") },
      { id: "cust-2", name: "Sara", assignedAgentId: null, passportExpiry: new Date("2026-03-01") },
    ]);
    mockRepo.createManySkipDuplicates.mockResolvedValue(1);
    const r = await service.sweepPassportExpiry();
    expect(r.created).toBe(1);
    const [data] = mockRepo.createManySkipDuplicates.mock.calls[0]!;
    expect(data).toHaveLength(1); // cust-2 (no agent) filtered out
    expect(data[0].type).toBe("PASSPORT_EXPIRY");
  });
});

describe("sweepPaymentDue", () => {
  it("creates tasks for unpaid bookings with travel approaching", async () => {
    mockRepo.findPaymentDueCandidates.mockResolvedValue([
      { id: "bk-1", assignedAgentId: "agent-1", travelDate: new Date("2026-02-01"), balance: 50000n },
    ]);
    mockRepo.createManySkipDuplicates.mockResolvedValue(1);
    const r = await service.sweepPaymentDue();
    expect(r.created).toBe(1);
    const [data] = mockRepo.createManySkipDuplicates.mock.calls[0]!;
    expect(data[0].type).toBe("PAYMENT_DUE");
    expect(data[0].bookingId).toBe("bk-1");
  });
});
