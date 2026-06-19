import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the reports service.
 *
 * Strategy: mock the repository and audit modules so we test pure
 * business logic, permission checks, AGENT scoping, ACCOUNTANT
 * restrictions, and BigInt serialization without hitting the database.
 */

// ── Mock setup ──────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ auditLog: {} }),
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
  getRevenue: vi.fn(),
  getMonthlyRevenue: vi.fn(),
  getMonthlyCollections: vi.fn(),
  getLeadFunnel: vi.fn(),
  getAgentPerformance: vi.fn(),
  getDestinationPerformance: vi.fn(),
  getLeadSourcePerformance: vi.fn(),
  getPaymentsReport: vi.fn(),
  getTaskPerformance: vi.fn(),
  getMonthlyTasks: vi.fn(),
  getOverviewStats: vi.fn(),
  getRecentPayments: vi.fn(),
  getRecentBookings: vi.fn(),
  getRecentQuotations: vi.fn(),
};

vi.mock("@/modules/reports/report.repository", () => mockRepo);

// Import service AFTER mocks
const service = await import("@/modules/reports/report.service");

// ── Shared fixtures ─────────────────────────────────────────────────────────

const adminUser = {
  id: "user-admin-1",
  email: "admin@safar.local",
  name: "Admin",
  role: "ADMIN" as const,
};

const managerUser = {
  id: "user-mgr-1",
  email: "mgr@safar.local",
  name: "Manager",
  role: "MANAGER" as const,
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

const defaultFilters = {
  dateFrom: new Date("2026-01-01"),
  dateTo: new Date("2026-06-30"),
};

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock returns
  mockRepo.getRevenue.mockResolvedValue({
    totalBooked: 1000000n, // 10,000.00 PKR
    bookingCount: 5,
    totalCollected: 750000n, // 7,500.00 PKR
    totalRefunded: 50000n,   // 500.00 PKR
  });

  mockRepo.getMonthlyRevenue.mockResolvedValue([
    { month: "2026-01", value: 500000n },
    { month: "2026-02", value: 500000n },
  ]);

  mockRepo.getMonthlyCollections.mockResolvedValue([
    { month: "2026-01", value: 400000n },
    { month: "2026-02", value: 350000n },
  ]);

  mockRepo.getLeadFunnel.mockResolvedValue([
    { status: "NEW", count: 100 },
    { status: "CONTACTED", count: 80 },
    { status: "QUOTATION_SENT", count: 50 },
    { status: "NEGOTIATING", count: 30 },
    { status: "BOOKED", count: 20 },
    { status: "TRAVELLED", count: 10 },
    { status: "LOST", count: 15 },
  ]);

  mockRepo.getAgentPerformance.mockResolvedValue([
    {
      agentId: "a1",
      agentName: "Ali",
      leadsCreated: 50,
      bookings: 10,
      revenueBooked: 500000n,
      revenueCollected: 400000n,
      quotationsSent: 15,
    },
    {
      agentId: "a2",
      agentName: "Sara",
      leadsCreated: 30,
      bookings: 9,
      revenueBooked: 450000n,
      revenueCollected: 350000n,
      quotationsSent: 12,
    },
  ]);

  mockRepo.getDestinationPerformance.mockResolvedValue([
    { destination: "Makkah", leadCount: 40, bookingsCount: 15, revenue: 600000n },
    { destination: "Istanbul", leadCount: 20, bookingsCount: 5, revenue: 200000n },
  ]);

  mockRepo.getLeadSourcePerformance.mockResolvedValue([
    { source: "Walk-in", leadCount: 50, bookings: 10, revenue: 400000n },
    { source: "Referral", leadCount: 30, bookings: 8, revenue: 300000n },
  ]);

  mockRepo.getPaymentsReport.mockResolvedValue([
    {
      bookingId: "b1",
      bookingNumber: "BK-2026-000001",
      customerName: "Test Customer",
      totalPricePaisa: 200000n,
      totalPaid: 200000n,
      totalRefunded: 0n,
      agentName: "Ali",
    },
    {
      bookingId: "b2",
      bookingNumber: "BK-2026-000002",
      customerName: "Another Customer",
      totalPricePaisa: 150000n,
      totalPaid: 0n,
      totalRefunded: 0n,
      agentName: "Sara",
    },
  ]);

  mockRepo.getTaskPerformance.mockResolvedValue({
    open: 10,
    completed: 25,
    overdue: 3,
    avgCompletionHours: 48.5,
  });

  mockRepo.getMonthlyTasks.mockResolvedValue([
    { month: "2026-01", completed: 10, created: 15 },
    { month: "2026-02", completed: 15, created: 12 },
  ]);

  mockRepo.getOverviewStats.mockResolvedValue({
    revenueBooked: 1000000n,
    revenueCollected: 750000n,
    activeLeads: 42,
    bookedLeads: 20,
    totalLeads: 100,
    upcomingTravel: 5,
    overdueTasks: 3,
    expiringPassports: 2,
  });

  mockRepo.getRecentPayments.mockResolvedValue([]);
  mockRepo.getRecentBookings.mockResolvedValue([]);
  mockRepo.getRecentQuotations.mockResolvedValue([]);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Revenue Report", () => {
  it("calculates correct revenue metrics", async () => {
    const result = await service.getRevenueReport(adminUser, defaultFilters);

    expect(result.revenueBooked).toBe("1000000");
    expect(result.revenueCollected).toBe("750000");
    expect(result.refundTotal).toBe("50000");
    // outstanding = booked - collected - refunded = 1000000 - 750000 - 50000 = 200000
    expect(result.outstandingBalance).toBe("200000");
    // avg = 1000000 / 5 = 200000
    expect(result.averageBookingValue).toBe("200000");
    expect(result.bookingCount).toBe(5);
  });

  it("returns monthly data with labels", async () => {
    const result = await service.getRevenueReport(adminUser, defaultFilters);

    expect(result.monthlyRevenue).toHaveLength(2);
    expect(result.monthlyRevenue[0]!.label).toBe("Jan 2026");
    expect(result.monthlyRevenue[0]!.value).toBe("500000");
    expect(result.monthlyCollections).toHaveLength(2);
  });

  it("serializes BigInt values as strings", async () => {
    const result = await service.getRevenueReport(adminUser, defaultFilters);

    // All money fields must be strings, not bigint
    expect(typeof result.revenueBooked).toBe("string");
    expect(typeof result.revenueCollected).toBe("string");
    expect(typeof result.outstandingBalance).toBe("string");
    expect(typeof result.refundTotal).toBe("string");
    expect(typeof result.averageBookingValue).toBe("string");
  });

  it("handles zero bookings without division error", async () => {
    mockRepo.getRevenue.mockResolvedValue({
      totalBooked: 0n,
      bookingCount: 0,
      totalCollected: 0n,
      totalRefunded: 0n,
    });

    const result = await service.getRevenueReport(adminUser, defaultFilters);
    expect(result.averageBookingValue).toBe("0");
    expect(result.outstandingBalance).toBe("0");
  });
});

describe("Lead Funnel", () => {
  it("calculates correct percentages", async () => {
    const result = await service.getLeadFunnel(adminUser, defaultFilters);

    expect(result.totalLeads).toBe(305); // sum of all stages
    const newStage = result.stages.find((s) => s.stage === "NEW");
    expect(newStage).toBeDefined();
    expect(newStage!.count).toBe(100);
    // 100 / 305 * 100 = 32.79%
    expect(newStage!.percentage).toBeCloseTo(32.79, 1);
  });

  it("calculates drop-off between stages", async () => {
    const result = await service.getLeadFunnel(adminUser, defaultFilters);

    // First stage has 0 drop-off
    expect(result.stages[0]!.dropOff).toBe(0);

    // CONTACTED (80) from NEW (100): drop-off = (100-80)/100 = 20%
    const contacted = result.stages.find((s) => s.stage === "CONTACTED");
    expect(contacted!.dropOff).toBe(20);
  });

  it("includes all 7 stages even with zero counts", async () => {
    mockRepo.getLeadFunnel.mockResolvedValue([
      { status: "NEW", count: 10 },
    ]);
    const result = await service.getLeadFunnel(adminUser, defaultFilters);
    expect(result.stages).toHaveLength(7);
    expect(result.stages.find((s) => s.stage === "BOOKED")!.count).toBe(0);
  });
});

describe("Permission enforcement", () => {
  it("ADMIN sees all reports", async () => {
    await expect(service.getRevenueReport(adminUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getLeadFunnel(adminUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getAgentPerformance(adminUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getTaskReport(adminUser, defaultFilters)).resolves.toBeDefined();
  });

  it("MANAGER sees all reports", async () => {
    await expect(service.getRevenueReport(managerUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getLeadFunnel(managerUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getAgentPerformance(managerUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getTaskReport(managerUser, defaultFilters)).resolves.toBeDefined();
  });

  it("ACCOUNTANT sees financial reports only", async () => {
    await expect(service.getRevenueReport(accountantUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getPaymentsReport(accountantUser, defaultFilters)).resolves.toBeDefined();

    await expect(service.getLeadFunnel(accountantUser, defaultFilters)).rejects.toThrow(
      "Accountants can only access financial reports",
    );
    await expect(service.getAgentPerformance(accountantUser, defaultFilters)).rejects.toThrow(
      "Accountants can only access financial reports",
    );
    await expect(service.getTaskReport(accountantUser, defaultFilters)).rejects.toThrow(
      "Accountants can only access financial reports",
    );
    await expect(service.getDestinationReport(accountantUser, defaultFilters)).rejects.toThrow(
      "Accountants can only access financial reports",
    );
    await expect(service.getLeadSourceReport(accountantUser, defaultFilters)).rejects.toThrow(
      "Accountants can only access financial reports",
    );
  });

  it("AGENT sees all report types (own data only)", async () => {
    await expect(service.getRevenueReport(agentUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getLeadFunnel(agentUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getAgentPerformance(agentUser, defaultFilters)).resolves.toBeDefined();
    await expect(service.getTaskReport(agentUser, defaultFilters)).resolves.toBeDefined();
  });
});

describe("Agent scoping", () => {
  it("auto-injects agentId for AGENT role", async () => {
    await service.getRevenueReport(agentUser, defaultFilters);

    expect(mockRepo.getRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: agentUser.id }),
    );
  });

  it("does NOT inject agentId for ADMIN", async () => {
    await service.getRevenueReport(adminUser, defaultFilters);

    expect(mockRepo.getRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: undefined }),
    );
  });

  it("uses supplied agentId for ADMIN (filter by specific agent)", async () => {
    const filters = { ...defaultFilters, agentId: "specific-agent-id" };
    await service.getRevenueReport(adminUser, filters);

    expect(mockRepo.getRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "specific-agent-id" }),
    );
  });

  it("AGENT scoping overrides supplied agentId", async () => {
    const filters = { ...defaultFilters, agentId: "other-agent-id" };
    await service.getRevenueReport(agentUser, filters);

    // AGENT's own ID takes precedence
    expect(mockRepo.getRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: agentUser.id }),
    );
  });
});

describe("Agent Performance Report", () => {
  it("calculates conversion rates correctly", async () => {
    const result = await service.getAgentPerformance(adminUser, defaultFilters);

    expect(result.agents).toHaveLength(2);
    // Ali: 10/50 = 20%
    expect(result.agents[0]!.conversionRate).toBe(20);
    // Sara: 9/30 = 30%
    expect(result.agents[1]!.conversionRate).toBe(30);
  });

  it("identifies correct leaderboard winners", async () => {
    const result = await service.getAgentPerformance(adminUser, defaultFilters);

    expect(result.leaderboard.highestRevenue!.agentName).toBe("Ali");
    expect(result.leaderboard.highestConversion!.agentName).toBe("Sara");
  });

  it("handles empty agent list", async () => {
    mockRepo.getAgentPerformance.mockResolvedValue([]);
    const result = await service.getAgentPerformance(adminUser, defaultFilters);

    expect(result.agents).toHaveLength(0);
    expect(result.leaderboard.highestRevenue).toBeNull();
    expect(result.leaderboard.highestConversion).toBeNull();
  });
});

describe("Payments Report", () => {
  it("correctly classifies payment statuses", async () => {
    const result = await service.getPaymentsReport(adminUser, defaultFilters);

    expect(result.paidCount).toBe(1);
    expect(result.unpaidCount).toBe(1);
    expect(result.payments[0]!.status).toBe("paid");
    expect(result.payments[1]!.status).toBe("unpaid");
  });

  it("calculates outstanding balances", async () => {
    const result = await service.getPaymentsReport(adminUser, defaultFilters);

    // b2: outstanding = 150000 - 0 + 0 = 150000
    expect(result.payments[1]!.outstanding).toBe("150000");
  });
});

describe("Task Report", () => {
  it("calculates completion rate", async () => {
    const result = await service.getTaskReport(adminUser, defaultFilters);

    // total = 10 + 25 + 3 = 38
    // rate = 25/38 * 100 = 65.79%
    expect(result.completionRate).toBeCloseTo(65.79, 0);
  });

  it("rounds average completion hours", async () => {
    const result = await service.getTaskReport(adminUser, defaultFilters);
    expect(result.averageCompletionHours).toBe(48.5);
  });

  it("includes monthly trend data", async () => {
    const result = await service.getTaskReport(adminUser, defaultFilters);

    expect(result.monthlyTrend).toHaveLength(2);
    expect(result.monthlyTrend[0]!.label).toBe("Jan 2026");
    expect(result.monthlyTrend[0]!.completed).toBe(10);
    expect(result.monthlyTrend[0]!.created).toBe(15);
  });
});

describe("Overview Dashboard", () => {
  it("calculates conversion rate from totalLeads and bookedLeads", async () => {
    const result = await service.getOverviewDashboard(adminUser, defaultFilters);
    // 20/100 = 20%
    expect(result.conversionRate).toBe(20);
  });

  it("serializes all money fields", async () => {
    const result = await service.getOverviewDashboard(adminUser, defaultFilters);

    expect(typeof result.revenueBooked).toBe("string");
    expect(typeof result.revenueCollected).toBe("string");
    expect(typeof result.outstandingBalance).toBe("string");
  });
});

describe("Export", () => {
  it("rejects export for AGENT (no reports:export permission)", async () => {
    await expect(
      service.exportReport(agentUser, "revenue", "csv", defaultFilters),
    ).rejects.toThrow("Missing permission");
  });

  it("allows export for ADMIN", async () => {
    const result = await service.exportReport(adminUser, "revenue", "csv", defaultFilters);
    expect(result.reportType).toBe("revenue");
    expect(result.format).toBe("csv");
    expect(result.data).toBeDefined();
  });

  it("allows export for ACCOUNTANT (financial reports only)", async () => {
    await expect(
      service.exportReport(accountantUser, "revenue", "csv", defaultFilters),
    ).resolves.toBeDefined();

    await expect(
      service.exportReport(accountantUser, "lead-funnel", "csv", defaultFilters),
    ).rejects.toThrow("Accountants can only access financial reports");
  });
});
