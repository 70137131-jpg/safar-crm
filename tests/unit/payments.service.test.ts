import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Unit tests for the payments service — the money-critical path.
 * Covers overpayment prevention, refund bounds, void semantics, the AGENT
 * cash-only rule, ownership gating, idempotency, and derived balances.
 */

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
}));
vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));

const mockBookings = { getBooking: vi.fn() };
vi.mock("@/modules/bookings/bookings.service", () => mockBookings);

const mockRepo = {
  findById: vi.fn(),
  findByBooking: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  sumCollected: vi.fn(),
  lockBookingForUpdate: vi.fn(),
  create: vi.fn(),
  voidPayment: vi.fn(),
};
vi.mock("@/modules/payments/payments.repository", () => mockRepo);

const service = await import("@/modules/payments/payments.service");

const admin = { id: "u-admin", email: "a@s", name: "A", role: "ADMIN" as const };
const agent = { id: "agent-1", email: "g@s", name: "G", role: "AGENT" as const };
const accountant = { id: "u-acc", email: "c@s", name: "C", role: "ACCOUNTANT" as const };

const TOTAL = 100000n; // Rs 1,000.00

function paymentRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pay-1",
    bookingId: "bk-1",
    amountPaisa: 40000n,
    method: "CASH",
    status: "PAID",
    reference: null,
    paidAt: new Date("2026-01-01"),
    recordedById: "u-admin",
    recordedBy: { id: "u-admin", name: "A" },
    idempotencyKey: null,
    notes: null,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBookings.getBooking.mockResolvedValue({ id: "bk-1", totalPricePaisa: TOTAL, status: "PENDING" });
  mockRepo.lockBookingForUpdate.mockResolvedValue({ totalPricePaisa: TOTAL, status: "PENDING" });
  mockRepo.findByIdempotencyKey.mockResolvedValue(null);
  mockRepo.create.mockImplementation(async (data: { amountPaisa: bigint; method: string }) =>
    paymentRecord({ amountPaisa: data.amountPaisa, method: data.method }),
  );
});

// ── recordPayment ──────────────────────────────────────────────────────────

describe("recordPayment", () => {
  it("records a partial payment within the balance", async () => {
    mockRepo.sumCollected.mockResolvedValue(0n);
    const r = await service.recordPayment(admin, { bookingId: "bk-1", amount: 40000n, method: "CASH" } as never);
    expect(r.amountPaisa).toBe(40000n);
    expect(r.status).toBe("PAID");
  });

  it("allows paying the exact remaining balance to zero", async () => {
    mockRepo.sumCollected.mockResolvedValue(60000n);
    await service.recordPayment(admin, { bookingId: "bk-1", amount: 40000n, method: "BANK_TRANSFER" } as never);
    expect(mockRepo.create).toHaveBeenCalled();
  });

  it("rejects an overpayment (collected + amount > total)", async () => {
    mockRepo.sumCollected.mockResolvedValue(80000n);
    await expect(
      service.recordPayment(admin, { bookingId: "bk-1", amount: 40000n, method: "CASH" } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("blocks an AGENT from recording a non-cash payment", async () => {
    await expect(
      service.recordPayment(agent, { bookingId: "bk-1", amount: 10000n, method: "CARD" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an AGENT to record cash", async () => {
    mockRepo.sumCollected.mockResolvedValue(0n);
    const r = await service.recordPayment(agent, { bookingId: "bk-1", amount: 10000n, method: "CASH" } as never);
    expect(r.method).toBe("CASH");
  });

  it("refuses a payment on a cancelled booking", async () => {
    mockRepo.lockBookingForUpdate.mockResolvedValue({ totalPricePaisa: TOTAL, status: "CANCELLED" });
    mockRepo.sumCollected.mockResolvedValue(0n);
    await expect(
      service.recordPayment(admin, { bookingId: "bk-1", amount: 10000n, method: "CASH" } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("is idempotent — a known key returns the prior payment without inserting", async () => {
    mockRepo.findByIdempotencyKey.mockResolvedValue(paymentRecord({ id: "prior" }));
    const r = await service.recordPayment(admin, {
      bookingId: "bk-1", amount: 40000n, method: "CASH", idempotencyKey: "abc",
    } as never);
    expect(r.id).toBe("prior");
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("hides another agent's booking (ownership → NotFound)", async () => {
    mockBookings.getBooking.mockRejectedValue(new NotFoundError("Booking not found"));
    await expect(
      service.recordPayment(agent, { bookingId: "bk-x", amount: 10000n, method: "CASH" } as never),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── refundPayment ──────────────────────────────────────────────────────────

describe("refundPayment", () => {
  it("denies an AGENT (no payments:refund)", async () => {
    await expect(
      service.refundPayment(agent, { bookingId: "bk-1", amount: 10000n, method: "CASH", reason: "x" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates a negative PAID row within the collected amount", async () => {
    mockRepo.sumCollected.mockResolvedValue(60000n);
    const r = await service.refundPayment(accountant, {
      bookingId: "bk-1", amount: 25000n, method: "CASH", reason: "Trip cancelled",
    } as never);
    expect(r.amountPaisa).toBe(-25000n);
  });

  it("rejects refunding more than has been collected", async () => {
    mockRepo.sumCollected.mockResolvedValue(20000n);
    await expect(
      service.refundPayment(accountant, {
        bookingId: "bk-1", amount: 25000n, method: "CASH", reason: "x",
      } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── voidPayment ────────────────────────────────────────────────────────────

describe("voidPayment", () => {
  it("denies an AGENT", async () => {
    mockRepo.findById.mockResolvedValue(paymentRecord());
    await expect(service.voidPayment(agent, "pay-1", { voidReason: "x" } as never)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("voids a PAID payment", async () => {
    mockRepo.findById.mockResolvedValue(paymentRecord({ status: "PAID" }));
    mockRepo.voidPayment.mockResolvedValue(paymentRecord({ status: "VOIDED", voidedAt: new Date(), voidReason: "dup" }));
    const r = await service.voidPayment(admin, "pay-1", { voidReason: "dup" } as never);
    expect(r.status).toBe("VOIDED");
  });

  it("refuses to void an already-voided payment", async () => {
    mockRepo.findById.mockResolvedValue(paymentRecord({ status: "VOIDED" }));
    await expect(service.voidPayment(admin, "pay-1", { voidReason: "x" } as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it("404s an unknown payment", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.voidPayment(admin, "missing", { voidReason: "x" } as never)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── getBookingBalance ────────────────────────────────────────────────────────

describe("getBookingBalance", () => {
  it("derives balance = total − collected", async () => {
    mockRepo.sumCollected.mockResolvedValue(40000n);
    const b = await service.getBookingBalance(admin, "bk-1");
    expect(b.totalPaisa).toBe(TOTAL);
    expect(b.collectedPaisa).toBe(40000n);
    expect(b.balancePaisa).toBe(60000n);
    expect(b.fullyPaid).toBe(false);
  });

  it("reports fullyPaid once the balance reaches zero (after a refund nets out)", async () => {
    mockRepo.sumCollected.mockResolvedValue(100000n);
    const b = await service.getBookingBalance(admin, "bk-1");
    expect(b.balancePaisa).toBe(0n);
    expect(b.fullyPaid).toBe(true);
  });
});
