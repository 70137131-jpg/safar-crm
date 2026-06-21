import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the customers service.
 *
 * Strategy: mock the repository and audit modules so we test pure
 * business logic, permission checks, and phone normalisation
 * without hitting the database.
 */

// ── Mock setup ──────────────────────────────────────────────────────────────

// Spy on the per-row SAVEPOINT/ROLLBACK raw calls. Hoisted so the vi.mock
// factory (which is itself hoisted) can reference it.
const { txExec } = vi.hoisted(() => ({ txExec: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ customer: {}, auditLog: {}, $executeRawUnsafe: txExec }),
    ),
  },
}));

vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(
    async (
      _entry: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn({}),
  ),
  logAudit: vi.fn(),
}));

const mockRepo = {
  findById: vi.fn(),
  findMany: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  existsByEmail: vi.fn(),
  existsByPhone: vi.fn(),
  findDeleted: vi.fn(),
};

vi.mock("@/modules/customers/customers.repository", () => mockRepo);

// Import service AFTER mocks
const service = await import("@/modules/customers/customers.service");

// ── Shared fixtures ─────────────────────────────────────────────────────────

const adminUser = {
  id: "user-admin-1",
  email: "admin@safar.local",
  name: "Admin",
  role: "ADMIN" as const,
};

const agentUser = {
  id: "user-agent-1",
  email: "agent@safar.local",
  name: "Agent Ali",
  role: "AGENT" as const,
};

const accountantUser = {
  id: "user-acc-1",
  email: "acc@safar.local",
  name: "Accountant",
  role: "ACCOUNTANT" as const,
};

const mockCustomer = {
  id: "cust-1",
  name: "Test Customer",
  email: "test@example.com",
  phone: "+923001234567",
  nationality: "PK",
  passportNo: "AB1234567",
  passportExpiry: new Date("2027-01-01"),
  dob: new Date("1990-01-01"),
  address: "Lahore",
  notes: null,
  assignedAgentId: "user-agent-1",
  assignedAgent: { id: "user-agent-1", name: "Agent Ali", email: "agent@safar.local", role: "AGENT" },
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.existsByEmail.mockResolvedValue(false);
  mockRepo.existsByPhone.mockResolvedValue(false);
  mockRepo.create.mockResolvedValue(mockCustomer);
  mockRepo.update.mockResolvedValue(mockCustomer);
  mockRepo.softDelete.mockResolvedValue({ ...mockCustomer, deletedAt: new Date() });
  mockRepo.restore.mockResolvedValue(mockCustomer);
  mockRepo.findById.mockResolvedValue(mockCustomer);
  mockRepo.findMany.mockResolvedValue({ items: [mockCustomer], total: 1 });
  mockRepo.findDeleted.mockResolvedValue({ items: [], total: 0 });
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("createCustomer", () => {
  it("creates a customer successfully for ADMIN", async () => {
    const result = await service.createCustomer(adminUser, {
      name: "New Customer",
      phone: "03001234567",
    });
    expect(result.name).toBe("Test Customer"); // from mock
    expect(mockRepo.create).toHaveBeenCalled();
  });

  it("creates a customer for AGENT and auto-assigns", async () => {
    await service.createCustomer(agentUser, {
      name: "Agent Customer",
    });
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedAgent: { connect: { id: agentUser.id } },
      }),
      expect.anything(),
    );
  });

  it("rejects duplicate email", async () => {
    mockRepo.existsByEmail.mockResolvedValue(true);
    await expect(
      service.createCustomer(adminUser, {
        name: "Dup",
        email: "taken@example.com",
      }),
    ).rejects.toThrow("email already exists");
  });

  it("rejects duplicate phone", async () => {
    mockRepo.existsByPhone.mockResolvedValue(true);
    await expect(
      service.createCustomer(adminUser, {
        name: "Dup",
        phone: "03001234567",
      }),
    ).rejects.toThrow("phone number already exists");
  });

  it("rejects ACCOUNTANT (no customers:create permission)", async () => {
    await expect(
      service.createCustomer(accountantUser, { name: "Blocked" }),
    ).rejects.toThrow("Missing permission");
  });
});

describe("updateCustomer", () => {
  it("updates a customer for ADMIN", async () => {
    const result = await service.updateCustomer(adminUser, "cust-1", {
      name: "Updated Name",
    });
    expect(result).toBeDefined();
    expect(mockRepo.update).toHaveBeenCalled();
  });

  it("rejects update for AGENT on non-owned customer", async () => {
    mockRepo.findById.mockResolvedValue({
      ...mockCustomer,
      assignedAgentId: "other-agent",
    });
    await expect(
      service.updateCustomer(agentUser, "cust-1", { name: "Hack" }),
    ).rejects.toThrow();
  });

  it("throws NotFoundError for non-existent customer", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.updateCustomer(adminUser, "nonexistent", { name: "Ghost" }),
    ).rejects.toThrow("Customer not found");
  });
});

describe("deleteCustomer (soft delete)", () => {
  it("soft-deletes for ADMIN", async () => {
    await service.deleteCustomer(adminUser, "cust-1");
    expect(mockRepo.softDelete).toHaveBeenCalledWith("cust-1", expect.anything());
  });

  it("rejects delete for AGENT (no customers:delete)", async () => {
    await expect(
      service.deleteCustomer(agentUser, "cust-1"),
    ).rejects.toThrow("Missing permission");
  });
});

describe("restoreCustomer", () => {
  it("restores a deleted customer for ADMIN", async () => {
    mockRepo.findById.mockResolvedValue({
      ...mockCustomer,
      deletedAt: new Date(),
    });
    await service.restoreCustomer(adminUser, "cust-1");
    expect(mockRepo.restore).toHaveBeenCalledWith("cust-1", expect.anything());
  });

  it("rejects restore of non-deleted customer", async () => {
    mockRepo.findById.mockResolvedValue({ ...mockCustomer, deletedAt: null });
    await expect(
      service.restoreCustomer(adminUser, "cust-1"),
    ).rejects.toThrow("not deleted");
  });

  it("rejects restore if email is now taken", async () => {
    mockRepo.findById.mockResolvedValue({
      ...mockCustomer,
      deletedAt: new Date(),
    });
    mockRepo.existsByEmail.mockResolvedValue(true);
    await expect(
      service.restoreCustomer(adminUser, "cust-1"),
    ).rejects.toThrow("email already exists");
  });
});

describe("getCustomer", () => {
  it("returns customer for ADMIN", async () => {
    const result = await service.getCustomer(adminUser, "cust-1");
    expect(result.id).toBe("cust-1");
  });

  it("returns customer for owning AGENT", async () => {
    const result = await service.getCustomer(agentUser, "cust-1");
    expect(result.id).toBe("cust-1");
  });

  it("hides customer from non-owning AGENT", async () => {
    mockRepo.findById.mockResolvedValue({
      ...mockCustomer,
      assignedAgentId: "other-agent",
    });
    await expect(
      service.getCustomer(agentUser, "cust-1"),
    ).rejects.toThrow("Customer not found");
  });
});

describe("listCustomers", () => {
  it("scopes results for AGENT to owned records", async () => {
    await service.listCustomers(agentUser, {
      page: 1,
      pageSize: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
      includeDeleted: false,
    });
    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ assignedAgentId: agentUser.id }),
    );
  });

  it("returns all records for ADMIN", async () => {
    await service.listCustomers(adminUser, {
      page: 1,
      pageSize: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
      includeDeleted: false,
    });
    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ assignedAgentId: undefined }),
    );
  });
});

describe("importCustomers", () => {
  it("imports valid rows", async () => {
    const result = await service.importCustomers(adminUser, [
      { name: "Import 1" },
      { name: "Import 2" },
    ]);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
  });

  it("reports errors for duplicate emails", async () => {
    mockRepo.existsByEmail.mockResolvedValueOnce(true);
    const result = await service.importCustomers(adminUser, [
      { name: "Dup", email: "taken@example.com" },
    ]);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.error).toContain("Duplicate email");
  });

  it("rolls back a single failed row to its savepoint and continues the chunk", async () => {
    // Row 2 fails at insert; rows 1 and 3 still succeed.
    mockRepo.create
      .mockResolvedValueOnce(mockCustomer)
      .mockRejectedValueOnce(new Error("insert boom"))
      .mockResolvedValueOnce(mockCustomer);

    const result = await service.importCustomers(adminUser, [
      { name: "Row 1" },
      { name: "Row 2" },
      { name: "Row 3" },
    ]);

    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0]?.row).toBe(2);
    // The failed row opened a savepoint and was rolled back to it, leaving the
    // chunk transaction alive for row 3.
    expect(txExec).toHaveBeenCalledWith(expect.stringContaining("SAVEPOINT import_row"));
    expect(txExec).toHaveBeenCalledWith(
      expect.stringContaining("ROLLBACK TO SAVEPOINT import_row"),
    );
  });

  it("rejects AGENT (no customers:import)", async () => {
    await expect(
      service.importCustomers(agentUser, [{ name: "Blocked" }]),
    ).rejects.toThrow("Missing permission");
  });
});
