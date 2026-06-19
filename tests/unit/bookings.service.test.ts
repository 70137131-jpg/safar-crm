import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

/**
 * Unit tests for the bookings service.
 *
 * Strategy: mock the repository, audit, numbering, and customers service so we
 * test pure business logic — permission/ownership checks, status-transition
 * rules, optimistic-concurrency conflicts, and cancel semantics — without a DB.
 */

// ── Mock setup ──────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
}));

vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_entry: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/numbering/numbering", () => ({
  nextDocumentNumber: vi.fn(async () => "BK-2026-000001"),
}));

const mockCustomersService = { getCustomer: vi.fn() };
vi.mock("@/modules/customers/customers.service", () => mockCustomersService);

const mockRepo = {
  findById: vi.fn(),
  findMany: vi.fn(),
  findHistory: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateWithOcc: vi.fn(),
  createStatusEvent: vi.fn(),
};
vi.mock("@/modules/bookings/bookings.repository", () => mockRepo);

const service = await import("@/modules/bookings/bookings.service");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const adminUser = { id: "user-admin", email: "a@s.local", name: "Admin", role: "ADMIN" as const };
const agentUser = { id: "agent-1", email: "g@s.local", name: "Agent 1", role: "AGENT" as const };
const agent2User = { id: "agent-2", email: "g2@s.local", name: "Agent 2", role: "AGENT" as const };
const accountantUser = { id: "user-acc", email: "c@s.local", name: "Acc", role: "ACCOUNTANT" as const };

function bookingRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "bk-1",
    bookingNumber: "BK-2026-000001",
    customerId: "cust-1",
    customer: { id: "cust-1", name: "Cust", assignedAgentId: "agent-1" },
    leadId: null,
    packageId: null,
    travelDate: null,
    status: "PENDING",
    totalPricePaisa: 50000000n, // Rs 500,000
    notes: null,
    confirmedAt: null,
    ticketedAt: null,
    completedAt: null,
    cancelReason: null,
    cancelNotes: null,
    cancelledAt: null,
    version: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createBooking ─────────────────────────────────────────────────────────────

describe("createBooking", () => {
  it("denies ACCOUNTANT (no bookings:create)", async () => {
    await expect(
      service.createBooking(accountantUser, { customerId: "cust-1" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING booking with a minted number and an initial status event", async () => {
    mockCustomersService.getCustomer.mockResolvedValue({ id: "cust-1" });
    mockRepo.create.mockResolvedValue(bookingRecord());

    const result = await service.createBooking(adminUser, {
      customerId: "cust-1",
      totalPrice: 50000000n,
    } as never);

    expect(result.bookingNumber).toBe("BK-2026-000001");
    expect(result.status).toBe("PENDING");
    expect(mockRepo.createStatusEvent).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: null, toStatus: "PENDING" }),
      expect.anything(),
    );
  });

  it("defaults totalPrice to 0 paisa when omitted", async () => {
    mockCustomersService.getCustomer.mockResolvedValue({ id: "cust-1" });
    mockRepo.create.mockResolvedValue(bookingRecord({ totalPricePaisa: 0n }));

    await service.createBooking(adminUser, { customerId: "cust-1" } as never);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalPricePaisa: 0n }),
      expect.anything(),
    );
  });

  it("blocks an AGENT from booking against a customer they do not own", async () => {
    // getCustomer enforces ownership and throws NotFound for non-owned customers.
    mockCustomersService.getCustomer.mockRejectedValue(new NotFoundError("Customer not found"));
    await expect(
      service.createBooking(agentUser, { customerId: "cust-other" } as never),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

// ── getBooking ownership ───────────────────────────────────────────────────────

describe("getBooking ownership", () => {
  it("returns the booking to the owning agent", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ customer: { id: "cust-1", name: "C", assignedAgentId: "agent-1" } }));
    const r = await service.getBooking(agentUser, "bk-1");
    expect(r.id).toBe("bk-1");
  });

  it("hides another agent's booking as NotFound", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ customer: { id: "cust-1", name: "C", assignedAgentId: "agent-1" } }));
    await expect(service.getBooking(agent2User, "bk-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFound when the booking does not exist", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getBooking(adminUser, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── changeStatus transitions ────────────────────────────────────────────────────

describe("changeStatus", () => {
  it("advances PENDING → CONFIRMED and stamps confirmedAt", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "PENDING" }));
    mockRepo.updateWithOcc.mockResolvedValue(bookingRecord({ status: "CONFIRMED" }));

    await service.changeStatus(adminUser, "bk-1", { status: "CONFIRMED", version: 0 } as never);

    const [, , data] = mockRepo.updateWithOcc.mock.calls[0]!;
    expect(data.status).toBe("CONFIRMED");
    expect(data.confirmedAt).toBeInstanceOf(Date);
  });

  it("rejects an illegal jump (PENDING → COMPLETED)", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "PENDING" }));
    await expect(
      service.changeStatus(adminUser, "bk-1", { status: "COMPLETED", version: 0 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockRepo.updateWithOcc).not.toHaveBeenCalled();
  });

  it("rejects CANCELLED via changeStatus (must use cancel)", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "PENDING" }));
    await expect(
      service.changeStatus(adminUser, "bk-1", { status: "CANCELLED", version: 0 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns a conflict when the version is stale (OCC)", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "PENDING" }));
    mockRepo.updateWithOcc.mockResolvedValue(null);
    await expect(
      service.changeStatus(adminUser, "bk-1", { status: "CONFIRMED", version: 99 } as never),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ── cancelBooking ──────────────────────────────────────────────────────────────

describe("cancelBooking", () => {
  it("cancels a PENDING booking with a reason (payments untouched)", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "PENDING" }));
    mockRepo.updateWithOcc.mockResolvedValue(bookingRecord({ status: "CANCELLED" }));

    await service.cancelBooking(adminUser, "bk-1", {
      version: 0,
      cancelReason: "CUSTOMER_REQUEST",
    } as never);

    const [, , data] = mockRepo.updateWithOcc.mock.calls[0]!;
    expect(data.status).toBe("CANCELLED");
    expect(data.cancelReason).toBe("CUSTOMER_REQUEST");
    expect(data.cancelledAt).toBeInstanceOf(Date);
  });

  it("refuses to cancel an already-cancelled booking", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "CANCELLED" }));
    await expect(
      service.cancelBooking(adminUser, "bk-1", { version: 0, cancelReason: "OTHER" } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to cancel a completed booking", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "COMPLETED" }));
    await expect(
      service.cancelBooking(adminUser, "bk-1", { version: 0, cancelReason: "OTHER" } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("denies an AGENT cancelling another agent's booking", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ customer: { id: "cust-1", name: "C", assignedAgentId: "agent-1" } }));
    await expect(
      service.cancelBooking(agent2User, "bk-1", { version: 0, cancelReason: "OTHER" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── updateBooking ─────────────────────────────────────────────────────────────

describe("updateBooking", () => {
  it("refuses to edit a cancelled booking", async () => {
    mockRepo.findById.mockResolvedValue(bookingRecord({ status: "CANCELLED" }));
    await expect(
      service.updateBooking(adminUser, "bk-1", { notes: "x" } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
