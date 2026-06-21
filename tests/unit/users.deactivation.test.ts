import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError } from "@/lib/errors";

/**
 * Deactivating a user must be gated on their open pipeline: an ADMIN cannot
 * deactivate (directly, or via Edit → uncheck Active) a user who still owns
 * open leads — they have to reassign first so nothing is orphaned.
 * (TASKS.md §1.1 — "deactivation gated by open leads".)
 */

vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    $context: Promise.resolve({
      password: { hash: async (p: string) => `hashed:${p}`, verify: async () => true },
    }),
  },
}));

const mockRepo = {
  findById: vi.fn(),
  countActiveAdmins: vi.fn(),
  update: vi.fn(),
};
vi.mock("@/modules/users/users.repository", () => mockRepo);

const mockLeads = { countOpenLeadsForAgent: vi.fn() };
vi.mock("@/modules/leads/leads.service", () => mockLeads);

const service = await import("@/modules/users/users.service");

const admin = { id: "u-admin", email: "admin@x.test", name: "Admin", role: "ADMIN" as const };

const target = {
  id: "u-agent",
  name: "Agent Bob",
  email: "bob@x.test",
  avatar: null,
  role: "AGENT" as const,
  deactivatedAt: null as Date | null,
  emailVerified: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.findById.mockResolvedValue(target);
  mockRepo.countActiveAdmins.mockResolvedValue(1);
  mockRepo.update.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
    ...target,
    ...data,
  }));
  mockLeads.countOpenLeadsForAgent.mockResolvedValue(0);
});

describe("deactivateUser — open-lead guard", () => {
  it("blocks deactivation while the user owns open leads, writing nothing", async () => {
    mockLeads.countOpenLeadsForAgent.mockResolvedValue(3);
    await expect(service.deactivateUser(admin, target.id)).rejects.toBeInstanceOf(ConflictError);
    expect(mockLeads.countOpenLeadsForAgent).toHaveBeenCalledWith(target.id);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("allows deactivation once the pipeline is clear", async () => {
    mockLeads.countOpenLeadsForAgent.mockResolvedValue(0);
    const res = await service.deactivateUser(admin, target.id);
    expect(res.isActive).toBe(false);
    expect(mockRepo.update).toHaveBeenCalledWith(
      target.id,
      expect.objectContaining({ deactivatedAt: expect.any(Date) }),
      expect.anything(),
    );
  });
});

describe("updateUser — open-lead guard on going inactive", () => {
  const base = { name: target.name, avatar: undefined, role: "AGENT" as const };

  it("blocks setting isActive:false while open leads remain", async () => {
    mockLeads.countOpenLeadsForAgent.mockResolvedValue(1);
    await expect(
      service.updateUser(admin, target.id, { ...base, isActive: false }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it("does not check the pipeline when the user stays active", async () => {
    await service.updateUser(admin, target.id, { ...base, isActive: true });
    expect(mockLeads.countOpenLeadsForAgent).not.toHaveBeenCalled();
    expect(mockRepo.update).toHaveBeenCalled();
  });
});
