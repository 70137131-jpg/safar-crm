import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the documents service.
 *
 * Strategy: mock db / audit / repository and the network-touching R2 calls,
 * but keep the REAL assertUploadConstraints + buildDocumentKey so mime/size
 * validation and key construction are genuinely exercised.
 */

// r2.ts is `server-only`; neutralize that guard so importActual works in node.
vi.mock("server-only", () => ({}));

const mockDb = {
  task: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ task: { create: mockDb.task.create } }),
  ),
};
vi.mock("@/lib/db", () => ({ db: mockDb }));

const mockAudit = {
  withAudit: vi.fn(async (_entry: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  logAudit: vi.fn(),
};
vi.mock("@/lib/audit", () => mockAudit);

const r2Mocks = {
  createSignedUploadUrl: vi.fn(),
  createSignedDownloadUrl: vi.fn(),
  headObject: vi.fn(),
  deleteFile: vi.fn(),
  uploadFile: vi.fn(),
};
vi.mock("@/lib/storage/r2", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/storage/r2");
  return { ...actual, ...r2Mocks };
});

const mockRepo = {
  findById: vi.fn(),
  findByCustomer: vi.fn(),
  findByBooking: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
  findCustomerOwnership: vi.fn(),
  findBookingOwnership: vi.fn(),
  findExpiringByType: vi.fn(),
};
vi.mock("@/modules/documents/documents.repository", () => mockRepo);

const service = await import("@/modules/documents/documents.service");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser = { id: "user-admin-1", email: "admin@safar.local", name: "Admin", role: "ADMIN" as const };
const agentUser = { id: "user-agent-1", email: "agent@safar.local", name: "Agent", role: "AGENT" as const };
const accountantUser = { id: "user-acc-1", email: "acc@safar.local", name: "Acc", role: "ACCOUNTANT" as const };

const docRecord = {
  id: "doc-1",
  type: "PASSPORT" as const,
  fileName: "passport.pdf",
  contentType: "application/pdf",
  sizeBytes: 1000,
  fileKey: "documents/cust-1/uuid-x/passport.pdf",
  checksumSha256: "a".repeat(64),
  expiryDate: null,
  customerId: "cust-1",
  bookingId: null,
  uploadedById: "user-agent-1",
  uploadedBy: { id: "user-agent-1", name: "Agent" },
  customer: { id: "cust-1", assignedAgentId: "user-agent-1", deletedAt: null },
  booking: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validUpload = {
  fileName: "passport.pdf",
  contentType: "application/pdf",
  sizeBytes: 1000,
  checksumSha256: "a".repeat(64),
  type: "PASSPORT" as const,
  customerId: "cust-1",
};

const validConfirm = {
  fileKey: "documents/cust-1/uuid-x/passport.pdf",
  fileName: "passport.pdf",
  contentType: "application/pdf",
  sizeBytes: 1000,
  checksumSha256: "a".repeat(64),
  type: "PASSPORT" as const,
  customerId: "cust-1",
  expiryDate: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.findCustomerOwnership.mockResolvedValue({ id: "cust-1", assignedAgentId: "user-agent-1" });
  mockRepo.findBookingOwnership.mockResolvedValue({
    id: "bk-1",
    customerId: "cust-1",
    customer: { id: "cust-1", assignedAgentId: "user-agent-1" },
  });
  mockRepo.findById.mockResolvedValue(docRecord);
  mockRepo.create.mockResolvedValue(docRecord);
  mockRepo.update.mockResolvedValue(docRecord);
  mockRepo.deleteById.mockResolvedValue(docRecord);
  mockRepo.findByCustomer.mockResolvedValue([docRecord]);
  mockRepo.findByBooking.mockResolvedValue([docRecord]);
  mockRepo.findExpiringByType.mockResolvedValue([]);
  r2Mocks.createSignedUploadUrl.mockResolvedValue("https://r2.example/put");
  r2Mocks.createSignedDownloadUrl.mockResolvedValue("https://r2.example/get");
  r2Mocks.headObject.mockResolvedValue({ contentLength: 1000, contentType: "application/pdf", etag: "x" });
  r2Mocks.deleteFile.mockResolvedValue(undefined);
  mockDb.task.findFirst.mockResolvedValue(null);
  mockDb.task.create.mockResolvedValue({ id: "task-1" });
});

// ── createUploadTicket ──────────────────────────────────────────────────────

describe("createUploadTicket", () => {
  it("returns a signed PUT URL + content-addressed key for ADMIN", async () => {
    const ticket = await service.createUploadTicket(adminUser, validUpload);
    expect(ticket.uploadUrl).toBe("https://r2.example/put");
    expect(ticket.fileKey.startsWith("documents/cust-1/")).toBe(true);
    expect(r2Mocks.createSignedUploadUrl).toHaveBeenCalled();
  });

  it("signs the PUT with the base64 SHA-256 and returns the checksum header so R2 verifies on write", async () => {
    const expectedB64 = Buffer.from(validUpload.checksumSha256, "hex").toString("base64");
    const ticket = await service.createUploadTicket(adminUser, validUpload);
    expect(r2Mocks.createSignedUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ checksumSha256Base64: expectedB64 }),
    );
    expect(ticket.requiredHeaders["x-amz-checksum-sha256"]).toBe(expectedB64);
  });

  it("rejects an unsupported mime type", async () => {
    await expect(
      service.createUploadTicket(adminUser, { ...validUpload, contentType: "application/zip" }),
    ).rejects.toThrow(/Unsupported file type/);
  });

  it("rejects a file over the 25 MB limit", async () => {
    await expect(
      service.createUploadTicket(adminUser, { ...validUpload, sizeBytes: 26 * 1024 * 1024 }),
    ).rejects.toThrow(/limit/);
  });

  it("rejects ACCOUNTANT (no documents:upload)", async () => {
    await expect(service.createUploadTicket(accountantUser, validUpload)).rejects.toThrow(
      /Missing permission/,
    );
  });

  it("rejects AGENT uploading to a non-owned customer", async () => {
    mockRepo.findCustomerOwnership.mockResolvedValue({ id: "cust-1", assignedAgentId: "other-agent" });
    await expect(service.createUploadTicket(agentUser, validUpload)).rejects.toThrow();
  });
});

// ── confirmUpload ─────────────────────────────────────────────────────────────

describe("confirmUpload", () => {
  it("records the row after a successful HEAD, omitting fileKey from the DTO", async () => {
    const dto = await service.confirmUpload(adminUser, validConfirm);
    expect(mockRepo.create).toHaveBeenCalled();
    expect(dto.id).toBe("doc-1");
    expect(dto).not.toHaveProperty("fileKey");
    expect(dto).not.toHaveProperty("checksumSha256");
  });

  it("throws when the object never landed (HEAD null)", async () => {
    r2Mocks.headObject.mockResolvedValue(null);
    await expect(service.confirmUpload(adminUser, validConfirm)).rejects.toThrow(/not found in storage/);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("deletes the orphan and throws on a size mismatch", async () => {
    r2Mocks.headObject.mockResolvedValue({ contentLength: 999, contentType: "application/pdf", etag: "x" });
    await expect(service.confirmUpload(adminUser, validConfirm)).rejects.toThrow(/size does not match/);
    expect(r2Mocks.deleteFile).toHaveBeenCalledWith(validConfirm.fileKey);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a fileKey that does not belong to the target customer", async () => {
    await expect(
      service.confirmUpload(adminUser, { ...validConfirm, fileKey: "documents/other-cust/u/p.pdf" }),
    ).rejects.toThrow(/does not match/);
  });
});

// ── listDocuments ─────────────────────────────────────────────────────────────

describe("listDocuments", () => {
  it("returns DTOs (no fileKey) for an authorized viewer", async () => {
    const list = await service.listDocuments(adminUser, { customerId: "cust-1" });
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("fileKey");
  });

  it("rejects AGENT listing a non-owned customer's documents", async () => {
    mockRepo.findCustomerOwnership.mockResolvedValue({ id: "cust-1", assignedAgentId: "other-agent" });
    await expect(service.listDocuments(agentUser, { customerId: "cust-1" })).rejects.toThrow();
  });
});

// ── getDownloadUrl ────────────────────────────────────────────────────────────

describe("getDownloadUrl", () => {
  it("returns a signed URL and audits the access for ADMIN", async () => {
    const res = await service.getDownloadUrl(adminUser, "doc-1");
    expect(res.url).toBe("https://r2.example/get");
    expect(mockAudit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.download" }),
    );
  });

  it("denies a non-owning AGENT, audits the attempt, and throws 403", async () => {
    mockRepo.findById.mockResolvedValue({
      ...docRecord,
      customer: { id: "cust-1", assignedAgentId: "other-agent", deletedAt: null },
    });
    await expect(service.getDownloadUrl(agentUser, "doc-1")).rejects.toThrow(/do not have access/);
    expect(mockAudit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.download.denied" }),
    );
    expect(r2Mocks.createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("throws NotFound for a missing document", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getDownloadUrl(adminUser, "ghost")).rejects.toThrow(/not found/i);
  });
});

// ── delete / update ───────────────────────────────────────────────────────────

describe("deleteDocument", () => {
  it("hard-deletes the row then removes the object for ADMIN", async () => {
    await service.deleteDocument(adminUser, "doc-1");
    expect(mockRepo.deleteById).toHaveBeenCalled();
    expect(r2Mocks.deleteFile).toHaveBeenCalledWith(docRecord.fileKey);
  });

  it("rejects AGENT (no documents:delete)", async () => {
    await expect(service.deleteDocument(agentUser, "doc-1")).rejects.toThrow(/Missing permission/);
  });
});

describe("updateDocument", () => {
  it("updates metadata for ADMIN", async () => {
    await service.updateDocument(adminUser, "doc-1", { type: "VISA" });
    expect(mockRepo.update).toHaveBeenCalled();
  });

  it("rejects AGENT updating a non-owned document", async () => {
    mockRepo.findById.mockResolvedValue({
      ...docRecord,
      customer: { id: "cust-1", assignedAgentId: "other-agent", deletedAt: null },
    });
    await expect(service.updateDocument(agentUser, "doc-1", { type: "VISA" })).rejects.toThrow();
  });
});

// ── sweepDocumentExpiry ─────────────────────────────────────────────────────

describe("sweepDocumentExpiry", () => {
  const soon = new Date(Date.now() + 10 * 86_400_000);

  const passportDoc = {
    id: "doc-p",
    type: "PASSPORT",
    expiryDate: soon,
    customerId: "cust-1",
    uploadedById: "user-agent-1",
    customer: { id: "cust-1", name: "Cust", assignedAgentId: "agent-1", deletedAt: null },
  };
  const visaDoc = {
    id: "doc-v",
    type: "VISA",
    expiryDate: soon,
    customerId: "cust-2",
    uploadedById: "user-agent-1",
    customer: { id: "cust-2", name: "Cust2", assignedAgentId: "agent-2", deletedAt: null },
  };

  it("creates a passport and a visa task when none exist", async () => {
    mockRepo.findExpiringByType
      .mockResolvedValueOnce([passportDoc])
      .mockResolvedValueOnce([visaDoc]);

    const res = await service.sweepDocumentExpiry();
    expect(res.scanned).toBe(2);
    expect(res.passportTasksCreated).toBe(1);
    expect(res.visaTasksCreated).toBe(1);
    expect(mockDb.task.create).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — skips when an open task already exists", async () => {
    mockRepo.findExpiringByType.mockResolvedValueOnce([passportDoc]).mockResolvedValueOnce([]);
    mockDb.task.findFirst.mockResolvedValue({ id: "existing" });

    const res = await service.sweepDocumentExpiry();
    expect(res.passportTasksCreated).toBe(0);
    expect(mockDb.task.create).not.toHaveBeenCalled();
  });
});
