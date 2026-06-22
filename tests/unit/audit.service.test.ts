import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError } from "@/lib/errors";

/**
 * Unit tests for the audit-log read service. The repository is mocked; the
 * real permissions module is used so the `audit:view` gate (ADMIN/MANAGER only)
 * is genuinely exercised.
 */

const mockRepo = {
  findMany: vi.fn(),
  listActors: vi.fn(),
};
vi.mock("@/modules/audit/audit.repository", () => mockRepo);

const service = await import("@/modules/audit/audit.service");

const admin = { id: "u-admin", email: "a@s", name: "A", role: "ADMIN" as const };
const manager = { id: "u-mgr", email: "m@s", name: "M", role: "MANAGER" as const };
const agent = { id: "agent-1", email: "g@s", name: "G", role: "AGENT" as const };
const accountant = { id: "u-acc", email: "c@s", name: "C", role: "ACCOUNTANT" as const };

const baseInput = { page: 1, pageSize: 50, sortOrder: "desc" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.findMany.mockResolvedValue({ items: [], total: 0 });
  mockRepo.listActors.mockResolvedValue([]);
});

describe("audit.service.listAuditLogs", () => {
  it("lets ADMIN list and returns a paginated wrapper", async () => {
    const res = await service.listAuditLogs(admin, baseInput);
    expect(mockRepo.findMany).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 });
  });

  it("lets MANAGER list", async () => {
    await expect(service.listAuditLogs(manager, baseInput)).resolves.toBeDefined();
    expect(mockRepo.findMany).toHaveBeenCalledTimes(1);
  });

  it("forbids AGENT", async () => {
    await expect(service.listAuditLogs(agent, baseInput)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockRepo.findMany).not.toHaveBeenCalled();
  });

  it("forbids ACCOUNTANT", async () => {
    await expect(service.listAuditLogs(accountant, baseInput)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockRepo.findMany).not.toHaveBeenCalled();
  });

  it("passes filters through to the repository", async () => {
    const startDate = new Date("2026-01-01T00:00:00Z");
    const endDate = new Date("2026-02-01T00:00:00Z");
    await service.listAuditLogs(admin, {
      ...baseInput,
      page: 2,
      entity: "Lead",
      action: "convert",
      actorId: "agent-1",
      startDate,
      endDate,
    });
    expect(mockRepo.findMany).toHaveBeenCalledWith({
      page: 2,
      pageSize: 50,
      sortOrder: "desc",
      entity: "Lead",
      action: "convert",
      actorId: "agent-1",
      startDate,
      endDate,
    });
  });

  it("computes totalPages from the count", async () => {
    mockRepo.findMany.mockResolvedValue({ items: [], total: 120 });
    const res = await service.listAuditLogs(admin, { ...baseInput, pageSize: 50 });
    expect(res.totalPages).toBe(3);
  });
});

describe("audit.service.listAuditActors", () => {
  it("lets ADMIN list actors", async () => {
    mockRepo.listActors.mockResolvedValue([{ id: "u1", name: "Z" }]);
    await expect(service.listAuditActors(admin)).resolves.toEqual([{ id: "u1", name: "Z" }]);
  });

  it("forbids AGENT", async () => {
    await expect(service.listAuditActors(agent)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockRepo.listActors).not.toHaveBeenCalled();
  });
});
