import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

/** Unit tests for the invoices service — RBAC, numbering, status transitions. */

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
}));
vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/numbering/numbering", () => ({ nextDocumentNumber: vi.fn(async () => "INV-2026-000001") }));

const mockBookings = { getBooking: vi.fn() };
vi.mock("@/modules/bookings/bookings.service", () => mockBookings);

const mockRepo = { findById: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
vi.mock("@/modules/invoices/invoices.repository", () => mockRepo);

const service = await import("@/modules/invoices/invoices.service");

const admin = { id: "u-admin", email: "a@s", name: "A", role: "ADMIN" as const };
const accountant = { id: "u-acc", email: "c@s", name: "C", role: "ACCOUNTANT" as const };
const manager = { id: "u-mgr", email: "m@s", name: "M", role: "MANAGER" as const };
const agent = { id: "agent-1", email: "g@s", name: "G", role: "AGENT" as const };

function invoiceRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv-1",
    invoiceNumber: "INV-2026-000001",
    bookingId: "bk-1",
    booking: { bookingNumber: "BK-2026-000001" },
    amountPaisa: 50000000n,
    status: "ISSUED",
    issuedAt: new Date("2026-01-01"),
    paidAt: null,
    cancelledAt: null,
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBookings.getBooking.mockResolvedValue({ id: "bk-1", totalPricePaisa: 50000000n });
});

describe("createInvoice", () => {
  it("denies AGENT and MANAGER (no invoices:create)", async () => {
    await expect(service.createInvoice(agent, { bookingId: "bk-1" } as never)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.createInvoice(manager, { bookingId: "bk-1" } as never)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("defaults the amount to the booking total", async () => {
    mockRepo.create.mockResolvedValue(invoiceRecord());
    await service.createInvoice(accountant, { bookingId: "bk-1" } as never);
    const [data] = mockRepo.create.mock.calls[0]!;
    expect(data.amountPaisa).toBe(50000000n);
    expect(data.invoiceNumber).toBe("INV-2026-000001");
    expect(data.status).toBe("ISSUED");
  });

  it("honours an explicit amount override", async () => {
    mockRepo.create.mockResolvedValue(invoiceRecord({ amountPaisa: 12345n }));
    await service.createInvoice(admin, { bookingId: "bk-1", amount: 12345n } as never);
    const [data] = mockRepo.create.mock.calls[0]!;
    expect(data.amountPaisa).toBe(12345n);
  });
});

describe("markInvoicePaid", () => {
  it("moves ISSUED → PAID", async () => {
    mockRepo.findById.mockResolvedValue(invoiceRecord({ status: "ISSUED" }));
    mockRepo.update.mockResolvedValue(invoiceRecord({ status: "PAID", paidAt: new Date() }));
    const r = await service.markInvoicePaid(accountant, "inv-1");
    expect(r.status).toBe("PAID");
  });

  it("refuses to pay a cancelled invoice", async () => {
    mockRepo.findById.mockResolvedValue(invoiceRecord({ status: "CANCELLED" }));
    await expect(service.markInvoicePaid(accountant, "inv-1")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("voidInvoice", () => {
  it("voids an ISSUED invoice", async () => {
    mockRepo.findById.mockResolvedValue(invoiceRecord({ status: "ISSUED" }));
    mockRepo.update.mockResolvedValue(invoiceRecord({ status: "CANCELLED", cancelledAt: new Date() }));
    const r = await service.voidInvoice(admin, "inv-1", { reason: "error" } as never);
    expect(r.status).toBe("CANCELLED");
  });

  it("refuses to void a paid invoice", async () => {
    mockRepo.findById.mockResolvedValue(invoiceRecord({ status: "PAID" }));
    await expect(service.voidInvoice(admin, "inv-1", {} as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it("denies AGENT (no invoices:void)", async () => {
    mockRepo.findById.mockResolvedValue(invoiceRecord());
    await expect(service.voidInvoice(agent, "inv-1", {} as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getInvoice", () => {
  it("404s an unknown invoice", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getInvoice(admin, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
