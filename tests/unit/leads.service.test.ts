import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

/**
 * Unit tests for the leads service — status rules, OCC, ownership scoping, and
 * the convert-to-customer+booking transaction.
 */

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
}));
vi.mock("@/lib/phone/normalize", () => ({
  normalizePakistaniPhone: (p: string) => p,
}));
vi.mock("@/lib/numbering/numbering", () => ({
  nextDocumentNumber: vi.fn(async () => "BK-2026-000001"),
}));

// A configurable transaction client used by withAudit (convertLead uses it).
let tx: {
  customer: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  booking: { create: ReturnType<typeof vi.fn> };
  interaction: { create: ReturnType<typeof vi.fn> };
};
vi.mock("@/lib/audit", () => ({
  withAudit: vi.fn(async (_e: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  logAudit: vi.fn(),
}));

const mockRepo = {
  findById: vi.fn(),
  findMany: vi.fn(),
  findForKanban: vi.fn(),
  findHistory: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateWithOcc: vi.fn(),
  createStatusEvent: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
};
vi.mock("@/modules/leads/leads.repository", () => mockRepo);

const service = await import("@/modules/leads/leads.service");

const admin = { id: "u-admin", email: "a@s", name: "A", role: "ADMIN" as const };
const manager = { id: "u-mgr", email: "m@s", name: "M", role: "MANAGER" as const };
const agent = { id: "agent-1", email: "g@s", name: "G", role: "AGENT" as const };
const otherAgent = { id: "agent-2", email: "g2@s", name: "G2", role: "AGENT" as const };

function leadRecord(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lead-1",
    contactName: "Ahmed Raza",
    contactPhone: "+923001234567",
    contactEmail: "ahmed@example.com",
    customerId: null,
    status: "NEW",
    source: null,
    assignedAgentId: "agent-1",
    assignedAgent: { id: "agent-1", name: "G" },
    destination: "Jeddah",
    tripPurpose: null,
    routeShape: null,
    pax: null,
    budgetPaisa: 60000n,
    travelDate: new Date("2026-12-15"),
    lostReason: null,
    lostNotes: null,
    version: 1,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx = {
    customer: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "cust-new" }) },
    booking: { create: vi.fn().mockResolvedValue({ id: "bk-new" }) },
    interaction: { create: vi.fn().mockResolvedValue({}) },
  };
  mockRepo.findById.mockResolvedValue(leadRecord());
  mockRepo.create.mockImplementation(async () => leadRecord());
  mockRepo.update.mockImplementation(async () => leadRecord());
  mockRepo.updateWithOcc.mockImplementation(async (_id, _v, data) => leadRecord(data as object));
  mockRepo.softDelete.mockResolvedValue(leadRecord({ deletedAt: new Date() }));
  mockRepo.restore.mockResolvedValue(leadRecord({ deletedAt: null }));
});

// ── getLead ─────────────────────────────────────────────────────────────────
describe("getLead", () => {
  it("returns the lead for an owner agent", async () => {
    const r = await service.getLead(agent, "lead-1");
    expect(r.id).toBe("lead-1");
  });

  it("hides another agent's lead (NotFound)", async () => {
    await expect(service.getLead(otherAgent, "lead-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s a missing lead", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getLead(admin, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── listLeads ─────────────────────────────────────────────────────────────────
describe("listLeads", () => {
  beforeEach(() => mockRepo.findMany.mockResolvedValue({ items: [], total: 0 }));

  it("forces an AGENT to their own assigned scope", async () => {
    await service.listLeads(agent, { page: 1, pageSize: 20, assignedAgentId: "agent-2" } as never);
    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ assignedAgentId: "agent-1" }),
    );
  });

  it("lets ADMIN filter by any agent and honors includeDeleted", async () => {
    await service.listLeads(admin, { page: 1, pageSize: 20, assignedAgentId: "agent-2", includeDeleted: true } as never);
    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ assignedAgentId: "agent-2", includeDeleted: true }),
    );
  });

  it("ignores includeDeleted for an AGENT", async () => {
    await service.listLeads(agent, { page: 1, pageSize: 20, includeDeleted: true } as never);
    expect(mockRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ includeDeleted: false }),
    );
  });
});

// ── createLead ────────────────────────────────────────────────────────────────
describe("createLead", () => {
  it("auto-assigns a new lead to the creating AGENT", async () => {
    await service.createLead(agent, { contactName: "X", contactPhone: "03001234567" } as never);
    const arg = mockRepo.create.mock.calls[0]![0] as { assignedAgent?: { connect: { id: string } } };
    expect(arg.assignedAgent?.connect.id).toBe("agent-1");
  });

  it("denies a user without leads:create (ACCOUNTANT)", async () => {
    const accountant = { id: "c", email: "c@s", name: "C", role: "ACCOUNTANT" as const };
    await expect(
      service.createLead(accountant, { contactName: "X", contactPhone: "03001234567" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── updateLead ────────────────────────────────────────────────────────────────
describe("updateLead", () => {
  it("blocks an AGENT from editing another agent's lead", async () => {
    await expect(
      service.updateLead(otherAgent, "lead-1", { contactName: "Y", contactPhone: "03001234567" } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("404s a missing lead", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.updateLead(admin, "missing", { contactName: "Y", contactPhone: "03001234567" } as never),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates an owned lead", async () => {
    await service.updateLead(agent, "lead-1", { contactName: "Y", contactPhone: "03001234567" } as never);
    expect(mockRepo.update).toHaveBeenCalled();
  });
});

// ── changeStatus ──────────────────────────────────────────────────────────────
describe("changeStatus", () => {
  it("refuses to set BOOKED manually", async () => {
    await expect(
      service.changeStatus(admin, "lead-1", { status: "BOOKED", version: 1 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses TRAVELLED unless currently BOOKED", async () => {
    mockRepo.findById.mockResolvedValue(leadRecord({ status: "CONTACTED" }));
    await expect(
      service.changeStatus(admin, "lead-1", { status: "TRAVELLED", version: 1 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows TRAVELLED when currently BOOKED", async () => {
    mockRepo.findById.mockResolvedValue(leadRecord({ status: "BOOKED" }));
    const r = await service.changeStatus(admin, "lead-1", { status: "TRAVELLED", version: 1 } as never);
    expect(r.status).toBe("TRAVELLED");
  });

  it("requires a reason for LOST", async () => {
    await expect(
      service.changeStatus(admin, "lead-1", { status: "LOST", version: 1 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("moves to a normal stage and writes a status event", async () => {
    const r = await service.changeStatus(admin, "lead-1", { status: "CONTACTED", version: 1 } as never);
    expect(r.status).toBe("CONTACTED");
    expect(mockRepo.createStatusEvent).toHaveBeenCalled();
  });

  it("raises ConflictError on a stale version (OCC)", async () => {
    mockRepo.updateWithOcc.mockResolvedValue(null);
    await expect(
      service.changeStatus(admin, "lead-1", { status: "CONTACTED", version: 99 } as never),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ── assignLead ────────────────────────────────────────────────────────────────
describe("assignLead", () => {
  it("denies an AGENT (no leads:assign)", async () => {
    await expect(
      service.assignLead(agent, "lead-1", { assignedAgentId: "agent-2", version: 1 } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a MANAGER reassign", async () => {
    await service.assignLead(manager, "lead-1", { assignedAgentId: "agent-2", version: 1 } as never);
    expect(mockRepo.updateWithOcc).toHaveBeenCalled();
  });

  it("raises ConflictError on stale version", async () => {
    mockRepo.updateWithOcc.mockResolvedValue(null);
    await expect(
      service.assignLead(manager, "lead-1", { assignedAgentId: "agent-2", version: 9 } as never),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ── deleteLead / restoreLead ──────────────────────────────────────────────────
describe("deleteLead", () => {
  it("denies an AGENT (no leads:delete)", async () => {
    await expect(service.deleteLead(agent, "lead-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("soft-deletes for a MANAGER", async () => {
    const r = await service.deleteLead(manager, "lead-1");
    expect(r.deletedAt).not.toBeNull();
    expect(mockRepo.softDelete).toHaveBeenCalled();
  });
});

describe("restoreLead", () => {
  it("rejects restoring a lead that is not deleted", async () => {
    mockRepo.findById.mockResolvedValue(leadRecord({ deletedAt: null }));
    await expect(service.restoreLead(admin, "lead-1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("restores a deleted lead", async () => {
    mockRepo.findById.mockResolvedValue(leadRecord({ deletedAt: new Date() }));
    const r = await service.restoreLead(admin, "lead-1");
    expect(mockRepo.restore).toHaveBeenCalled();
    expect(r.deletedAt).toBeNull();
  });
});

// ── convertLead ───────────────────────────────────────────────────────────────
describe("convertLead", () => {
  beforeEach(() => {
    mockRepo.updateWithOcc.mockImplementation(async (_id, _v, data) =>
      leadRecord({ ...(data as object), status: "BOOKED" }),
    );
  });

  it("rejects converting an already-booked lead", async () => {
    mockRepo.findById.mockResolvedValue(leadRecord({ status: "BOOKED" }));
    await expect(
      service.convertLead(admin, "lead-1", { version: 1 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects converting a LOST lead", async () => {
    mockRepo.findById.mockResolvedValue(leadRecord({ status: "LOST" }));
    await expect(
      service.convertLead(admin, "lead-1", { version: 1 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("denies an AGENT converting another agent's lead", async () => {
    await expect(
      service.convertLead(otherAgent, "lead-1", { version: 1 } as never),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates a customer + booking, advances to BOOKED, and returns the booking number", async () => {
    const r = await service.convertLead(admin, "lead-1", { version: 1 } as never);
    expect(tx.customer.create).toHaveBeenCalled();
    expect(tx.booking.create).toHaveBeenCalled();
    expect(tx.interaction.create).toHaveBeenCalled();
    expect(r.bookingNumber).toBe("BK-2026-000001");
    expect(r.bookingId).toBe("bk-new");
    expect(r.lead.status).toBe("BOOKED");
  });

  it("reuses an existing matched customer instead of creating one", async () => {
    tx.customer.findFirst.mockResolvedValue({ id: "cust-existing" });
    const r = await service.convertLead(admin, "lead-1", { version: 1 } as never);
    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(r.customerId).toBe("cust-existing");
  });

  it("raises ConflictError when the lead version is stale", async () => {
    mockRepo.updateWithOcc.mockResolvedValue(null);
    await expect(
      service.convertLead(admin, "lead-1", { version: 42 } as never),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
