import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

/**
 * Unit tests for the quotations service — totals math, the draft→send→accept
 * state machine, ownership, OCC, and the expiry sweep.
 */

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
}));
vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/numbering/numbering", () => ({ nextDocumentNumber: vi.fn(async () => "QT-2026-000001") }));
vi.mock("@/lib/email/outbox", () => ({ enqueueEmail: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ uploadFile: vi.fn() }));
vi.mock("@/modules/quotations/quotation-pdf", () => ({ renderQuotationPdf: vi.fn(async () => Buffer.from("pdf")) }));

const mockCustomers = { getCustomer: vi.fn() };
vi.mock("@/modules/customers/customers.service", () => mockCustomers);
const mockLeads = { getLead: vi.fn() };
vi.mock("@/modules/leads/leads.service", () => mockLeads);
const mockSettings = { getAgencyProfile: vi.fn() };
vi.mock("@/modules/settings/settings.service", () => mockSettings);

const mockRepo = {
  findById: vi.fn(),
  findMany: vi.fn(),
  findExpired: vi.fn(),
  create: vi.fn(),
  replaceDraft: vi.fn(),
  updateWithOcc: vi.fn(),
  setPdfKey: vi.fn(),
};
vi.mock("@/modules/quotations/quotations.repository", () => mockRepo);

const service = await import("@/modules/quotations/quotations.service");

const admin = { id: "u-admin", email: "a@s", name: "A", role: "ADMIN" as const };
const agent = { id: "agent-1", email: "g@s", name: "G", role: "AGENT" as const };
const agent2 = { id: "agent-2", email: "g2@s", name: "G2", role: "AGENT" as const };
const accountant = { id: "u-acc", email: "c@s", name: "C", role: "ACCOUNTANT" as const };

function quoteRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "q-1",
    quoteNumber: null,
    customerId: "cust-1",
    customer: { id: "cust-1", name: "Cust", email: "cust@x.com", assignedAgentId: "agent-1" },
    leadId: null,
    lead: null,
    validTill: new Date("2026-02-01"),
    subtotalPaisa: 100000n,
    taxPaisa: 15000n,
    discountPaisa: 0n,
    totalPaisa: 115000n,
    status: "DRAFT",
    notes: null,
    pdfFileKey: null,
    sentAt: null,
    issuedAt: null,
    acceptedAt: null,
    expiredAt: null,
    version: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    items: [
      { id: "it-1", position: 0, description: "Umrah package", quantity: 2, unitPricePaisa: 50000n, linePaisa: 100000n },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSettings.getAgencyProfile.mockResolvedValue({
    agencyName: "Safar", agencyAddress: null, agencyPhone: null, agencyEmail: null,
    agencyWebsite: null, taxRegistrationNo: null, defaultTaxBps: 1500, quoteValidDays: 14,
  });
  mockCustomers.getCustomer.mockResolvedValue({ id: "cust-1" });
  mockLeads.getLead.mockResolvedValue({ id: "lead-1" });
});

// ── createQuotation: totals ───────────────────────────────────────────────────

describe("createQuotation", () => {
  it("computes subtotal, 15% tax, and total from line items", async () => {
    mockRepo.create.mockResolvedValue(quoteRecord());
    await service.createQuotation(admin, {
      customerId: "cust-1",
      items: [{ description: "Umrah", quantity: 2, unitPrice: 50000n }],
      discount: 0n,
    } as never);

    const [data] = mockRepo.create.mock.calls[0]!;
    expect(data.subtotalPaisa).toBe(100000n);
    expect(data.taxPaisa).toBe(15000n); // 15% of 100000
    expect(data.totalPaisa).toBe(115000n);
  });

  it("applies a discount before tax", async () => {
    mockRepo.create.mockResolvedValue(quoteRecord());
    await service.createQuotation(admin, {
      customerId: "cust-1",
      items: [{ description: "X", quantity: 1, unitPrice: 100000n }],
      discount: 20000n,
    } as never);
    const [data] = mockRepo.create.mock.calls[0]!;
    // taxable = 100000 - 20000 = 80000; tax = 12000; total = 92000
    expect(data.taxPaisa).toBe(12000n);
    expect(data.totalPaisa).toBe(92000n);
  });

  it("rejects a discount greater than the subtotal", async () => {
    await expect(
      service.createQuotation(admin, {
        customerId: "cust-1",
        items: [{ description: "X", quantity: 1, unitPrice: 10000n }],
        discount: 20000n,
      } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("denies ACCOUNTANT (no quotations:create)", async () => {
    await expect(
      service.createQuotation(accountant, { customerId: "cust-1", items: [{ description: "X", quantity: 1, unitPrice: 1n }], discount: 0n } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks an AGENT quoting a customer they do not own", async () => {
    mockCustomers.getCustomer.mockRejectedValue(new NotFoundError("Customer not found"));
    await expect(
      service.createQuotation(agent, { customerId: "cust-x", items: [{ description: "X", quantity: 1, unitPrice: 1n }], discount: 0n } as never),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── updateQuotation ────────────────────────────────────────────────────────────

describe("updateQuotation", () => {
  it("refuses to edit a non-draft quotation", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "SENT" }));
    await expect(
      service.updateQuotation(admin, "q-1", { customerId: "cust-1", items: [{ description: "X", quantity: 1, unitPrice: 1n }], discount: 0n, version: 0 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("conflicts on a stale version", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "DRAFT", version: 3 }));
    await expect(
      service.updateQuotation(admin, "q-1", { customerId: "cust-1", items: [{ description: "X", quantity: 1, unitPrice: 1n }], discount: 0n, version: 0 } as never),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ── sendQuotation ──────────────────────────────────────────────────────────────

describe("sendQuotation", () => {
  it("mints a number, stores the PDF, and enqueues a notification", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "DRAFT" }));
    mockRepo.updateWithOcc.mockResolvedValue(quoteRecord({ status: "SENT", quoteNumber: "QT-2026-000001" }));
    const r2 = await import("@/lib/storage/r2");
    const outbox = await import("@/lib/email/outbox");

    const result = await service.sendQuotation(admin, "q-1", { version: 0 } as never);

    expect(result.status).toBe("SENT");
    expect(r2.uploadFile).toHaveBeenCalled();
    expect(mockRepo.setPdfKey).toHaveBeenCalled();
    expect(outbox.enqueueEmail).toHaveBeenCalled();
  });

  it("does not enqueue email when the target has no address", async () => {
    mockRepo.findById.mockResolvedValue(
      quoteRecord({ status: "DRAFT", customer: { id: "cust-1", name: "C", email: null, assignedAgentId: "agent-1" } }),
    );
    mockRepo.updateWithOcc.mockResolvedValue(
      quoteRecord({ status: "SENT", customer: { id: "cust-1", name: "C", email: null, assignedAgentId: "agent-1" } }),
    );
    const outbox = await import("@/lib/email/outbox");
    await service.sendQuotation(admin, "q-1", { version: 0 } as never);
    expect(outbox.enqueueEmail).not.toHaveBeenCalled();
  });

  it("refuses to send a non-draft", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "SENT" }));
    await expect(service.sendQuotation(admin, "q-1", { version: 0 } as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to send a draft with no items", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "DRAFT", items: [] }));
    await expect(service.sendQuotation(admin, "q-1", { version: 0 } as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it("conflicts on a stale version", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "DRAFT" }));
    mockRepo.updateWithOcc.mockResolvedValue(null);
    await expect(service.sendQuotation(admin, "q-1", { version: 9 } as never)).rejects.toBeInstanceOf(ConflictError);
  });
});

// ── acceptQuotation ─────────────────────────────────────────────────────────────

describe("acceptQuotation", () => {
  it("accepts a SENT quotation", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "SENT" }));
    mockRepo.updateWithOcc.mockResolvedValue(quoteRecord({ status: "ACCEPTED" }));
    const r = await service.acceptQuotation(admin, "q-1", { version: 0 } as never);
    expect(r.status).toBe("ACCEPTED");
  });

  it("refuses to accept a draft", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord({ status: "DRAFT" }));
    await expect(service.acceptQuotation(admin, "q-1", { version: 0 } as never)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── getQuotation ownership ───────────────────────────────────────────────────────

describe("getQuotation ownership", () => {
  it("hides another agent's quotation as NotFound", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord());
    await expect(service.getQuotation(agent2, "q-1")).rejects.toBeInstanceOf(NotFoundError);
  });
  it("returns it to the owning agent", async () => {
    mockRepo.findById.mockResolvedValue(quoteRecord());
    const r = await service.getQuotation(agent, "q-1");
    expect(r.id).toBe("q-1");
  });
});

// ── sweepQuotationExpiry ─────────────────────────────────────────────────────────

describe("sweepQuotationExpiry", () => {
  it("expires due SENT quotations and is idempotent on empty runs", async () => {
    mockRepo.findExpired.mockResolvedValueOnce([{ id: "q-1", version: 1 }, { id: "q-2", version: 0 }]);
    mockRepo.updateWithOcc.mockResolvedValue(quoteRecord({ status: "EXPIRED" }));
    const r1 = await service.sweepQuotationExpiry();
    expect(r1.expired).toBe(2);

    mockRepo.findExpired.mockResolvedValueOnce([]);
    const r2 = await service.sweepQuotationExpiry();
    expect(r2.expired).toBe(0);
  });
});
