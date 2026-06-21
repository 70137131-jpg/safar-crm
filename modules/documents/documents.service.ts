import type { DocumentType, TaskType } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import {
  ForbiddenError,
  IntegrationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { withAudit, logAudit } from "@/lib/audit";
import {
  assertUploadConstraints,
  buildDocumentKey,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  deleteFile,
  headObject,
} from "@/lib/storage/r2";
import { logger } from "@/lib/logger";
import * as repo from "./documents.repository";
import type {
  ConfirmUploadInput,
  CreateUploadUrlInput,
  ListDocumentsInput,
  UpdateDocumentInput,
} from "./documents.schemas";
import type { DocumentDTO, UploadTicket } from "./documents.types";

/**
 * Documents service — orchestration, authorization, audit.
 *
 * Security model (ARCHITECTURE.md §8):
 *   - Bytes never transit our server on upload: clients PUT directly to R2 via
 *     a presigned URL, then call confirmUpload() to finalize.
 *   - A Document row is recorded only after a HEAD confirms the object landed
 *     with the expected size.
 *   - Downloads are gated + audited and only ever yield a 5-minute signed URL.
 *   - AGENT access is ownership-scoped via the linked customer's assignedAgentId.
 */

// ─── Mapping ─────────────────────────────────────────────────────────────────

interface DocumentRecord {
  id: string;
  type: DocumentType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expiryDate: Date | null;
  customerId: string | null;
  bookingId: string | null;
  uploadedById: string;
  uploadedBy: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(r: DocumentRecord): DocumentDTO {
  return {
    id: r.id,
    type: r.type,
    fileName: r.fileName,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    expiryDate: r.expiryDate,
    customerId: r.customerId,
    bookingId: r.bookingId,
    uploadedById: r.uploadedById,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ─── Parent resolution + authorization ───────────────────────────────────────

interface ResolvedParent {
  customerId: string;
  bookingId: string | null;
  assignedAgentId: string | null;
}

/**
 * Validates the target customer/booking exists, applies the denorm rule
 * (a booking-linked document must carry the booking's customerId), and
 * authorizes `permission` with ownership scoping.
 */
async function resolveParentAndAuthorize(
  user: UserContext,
  parent: { customerId?: string; bookingId?: string },
  permission: "documents:upload" | "documents:view",
): Promise<ResolvedParent> {
  if (parent.bookingId) {
    const booking = await repo.findBookingOwnership(parent.bookingId);
    if (!booking) throw new NotFoundError("Booking not found");

    // Denorm: if a customerId was also supplied it must match the booking's.
    if (parent.customerId && parent.customerId !== booking.customerId) {
      throw new ValidationError("Customer does not match the booking", "customerId");
    }
    const assignedAgentId = booking.customer?.assignedAgentId ?? null;
    requirePermission(user, permission, { assignedAgentId });
    return { customerId: booking.customerId, bookingId: booking.id, assignedAgentId };
  }

  if (parent.customerId) {
    const customer = await repo.findCustomerOwnership(parent.customerId);
    if (!customer) throw new NotFoundError("Customer not found");
    requirePermission(user, permission, { assignedAgentId: customer.assignedAgentId });
    return { customerId: customer.id, bookingId: null, assignedAgentId: customer.assignedAgentId };
  }

  throw new ValidationError("A customer or booking is required", "customerId");
}

/** Ownership marker for an already-loaded document. */
function ownerResource(doc: {
  customerId: string | null;
  bookingId: string | null;
  customer?: { assignedAgentId: string | null } | null;
  booking?: { customer?: { assignedAgentId: string | null } | null } | null;
}): { assignedAgentId: string | null } {
  const assignedAgentId = doc.customerId
    ? (doc.customer?.assignedAgentId ?? null)
    : (doc.booking?.customer?.assignedAgentId ?? null);
  return { assignedAgentId };
}

// ─── Upload (two-step: presigned PUT, then confirm) ──────────────────────────

export async function createUploadTicket(
  user: UserContext,
  input: CreateUploadUrlInput,
): Promise<UploadTicket> {
  assertUploadConstraints(input.contentType, input.sizeBytes);
  const parent = await resolveParentAndAuthorize(user, input, "documents:upload");

  const fileKey = buildDocumentKey(parent.customerId, input.fileName);

  // The DB stores the SHA-256 as hex; R2 (S3) wants it base64 on the PUT. Signing
  // with it makes R2 reject the upload unless the bytes hash to this value, so a
  // Document row can only ever be confirmed for an object whose integrity already
  // matched at write time (TASKS.md §1.9 — "checksum verified before recording").
  const checksumBase64 = Buffer.from(input.checksumSha256, "hex").toString("base64");
  const uploadUrl = await createSignedUploadUrl({
    key: fileKey,
    contentType: input.contentType,
    checksumSha256Base64: checksumBase64,
  });

  return {
    uploadUrl,
    fileKey,
    requiredHeaders: {
      "Content-Type": input.contentType,
      "x-amz-checksum-sha256": checksumBase64,
    },
    expiresInSeconds: 300,
  };
}

export async function confirmUpload(
  user: UserContext,
  input: ConfirmUploadInput,
): Promise<DocumentDTO> {
  assertUploadConstraints(input.contentType, input.sizeBytes);
  const parent = await resolveParentAndAuthorize(user, input, "documents:upload");

  // The key must be one we issued for this exact customer — block confirming
  // an arbitrary object the caller doesn't own.
  if (!input.fileKey.startsWith(`documents/${parent.customerId}/`)) {
    throw new ValidationError("File key does not match the target customer", "fileKey");
  }

  // Confirm the object actually landed and matches the declared size. Its
  // SHA-256 was already verified by R2 at write time (the presigned PUT was
  // signed with x-amz-checksum-sha256), so the recorded checksum is trustworthy.
  const head = await headObject(input.fileKey);
  if (!head) {
    throw new IntegrationError("Upload was not found in storage — please retry.");
  }
  if (head.contentLength !== input.sizeBytes) {
    await deleteFile(input.fileKey).catch(() => {});
    throw new ValidationError("Uploaded file size does not match — please retry.", "sizeBytes");
  }
  // Re-assert the *actual* size against the cap (HEAD is the source of truth).
  assertUploadConstraints(input.contentType, head.contentLength);

  return withAudit(
    {
      actorId: user.id,
      action: "document.upload",
      entity: "Document",
      before: null,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: DocumentDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.create(
        {
          type: input.type,
          fileKey: input.fileKey,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: head.contentLength,
          checksumSha256: input.checksumSha256,
          expiryDate: input.expiryDate ?? null,
          customerId: parent.customerId,
          bookingId: parent.bookingId,
          uploadedById: user.id,
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDocuments(
  user: UserContext,
  input: ListDocumentsInput,
): Promise<DocumentDTO[]> {
  // Authorizes view on the parent (with ownership scoping) before listing.
  await resolveParentAndAuthorize(user, input, "documents:view");

  const records = input.bookingId
    ? await repo.findByBooking(input.bookingId)
    : await repo.findByCustomer(input.customerId!);

  return records.map(toDTO);
}

export interface DownloadTarget {
  url: string;
  fileName: string;
}

/**
 * Resolves a short-lived signed download URL for a document, enforcing
 * permission and writing an audit row for BOTH grants and denials
 * (TASKS.md §1.9 acceptance).
 */
export async function getDownloadUrl(
  user: UserContext,
  id: string,
  opts?: { disposition?: "attachment" | "inline" },
): Promise<DownloadTarget> {
  const doc = await repo.findById(id);
  if (!doc) throw new NotFoundError("Document not found");

  if (!can(user, "documents:view", ownerResource(doc))) {
    await logAudit({
      actorId: user.id,
      action: "document.download.denied",
      entity: "Document",
      entityId: doc.id,
      before: null,
      after: { reason: "forbidden" },
      ip: user.ip,
      userAgent: user.userAgent,
    });
    throw new ForbiddenError("You do not have access to this document");
  }

  const url = await createSignedDownloadUrl({
    key: doc.fileKey,
    fileName: doc.fileName,
    contentType: doc.contentType,
    disposition: opts?.disposition ?? "attachment",
  });

  await logAudit({
    actorId: user.id,
    action: "document.download",
    entity: "Document",
    entityId: doc.id,
    before: null,
    after: { fileName: doc.fileName, type: doc.type },
    ip: user.ip,
    userAgent: user.userAgent,
  });

  return { url, fileName: doc.fileName };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function updateDocument(
  user: UserContext,
  id: string,
  input: UpdateDocumentInput,
): Promise<DocumentDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Document not found");
  requirePermission(user, "documents:update", ownerResource(existing));

  const before = toDTO(existing);

  return withAudit(
    {
      actorId: user.id,
      action: "document.update",
      entity: "Document",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: DocumentDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(
        id,
        {
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate } : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );
}

/**
 * Hard-deletes the row (Document has no soft-delete column) inside an audited
 * transaction, then removes the R2 object best-effort. An orphaned object is
 * harmless; a row pointing at a missing object is not — so the row goes first.
 */
export async function deleteDocument(user: UserContext, id: string): Promise<DocumentDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Document not found");
  requirePermission(user, "documents:delete", ownerResource(existing));

  const before = toDTO(existing);
  const fileKey = existing.fileKey;

  const result = await withAudit(
    {
      actorId: user.id,
      action: "document.delete",
      entity: "Document",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: DocumentDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.deleteById(id, tx);
      return toDTO(record);
    },
  );

  // Row is gone (committed) — now remove the object. Failure is logged, not fatal.
  try {
    await deleteFile(fileKey);
  } catch (err) {
    logger.error({ err, documentId: id }, "document.delete.r2_orphan");
  }

  return result;
}

// ─── Cron: document expiry sweep ─────────────────────────────────────────────

export interface ExpirySweepResult {
  scanned: number;
  passportTasksCreated: number;
  visaTasksCreated: number;
}

const PASSPORT_WINDOW_DAYS = 45;
const VISA_WINDOW_DAYS = 30;

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Daily sweep: passports expiring within 45 days and visas within 30 days each
 * generate a follow-up Task. Idempotent — safe under Vercel Cron double-fire:
 *   - PASSPORT → TaskType.PASSPORT_EXPIRY, deduped by the partial unique index
 *     on (customerId) WHERE type=PASSPORT_EXPIRY AND status=OPEN.
 *   - VISA → TaskType.OTHER, deduped by a deterministic title per customer
 *     (the schema has no sourceKey column / VISA task type — see README note).
 */
export async function sweepDocumentExpiry(
  now: Date = new Date(),
): Promise<ExpirySweepResult> {
  const result: ExpirySweepResult = {
    scanned: 0,
    passportTasksCreated: 0,
    visaTasksCreated: 0,
  };

  const buckets: Array<{
    type: DocumentType;
    windowDays: number;
    taskType: TaskType;
    label: string;
  }> = [
    { type: "PASSPORT", windowDays: PASSPORT_WINDOW_DAYS, taskType: "PASSPORT_EXPIRY", label: "Passport" },
    { type: "VISA", windowDays: VISA_WINDOW_DAYS, taskType: "OTHER", label: "Visa" },
  ];

  for (const bucket of buckets) {
    const docs = await repo.findExpiringByType(
      bucket.type,
      now,
      addDays(now, bucket.windowDays),
    );

    for (const doc of docs) {
      result.scanned++;
      const customer = doc.customer;
      if (!customer || customer.deletedAt || !doc.customerId || !doc.expiryDate) continue;

      const dateStr = doc.expiryDate.toISOString().slice(0, 10);
      const title = `${bucket.label} expiring on ${dateStr} — ${customer.name}`;
      const created = await createExpiryTaskIdempotent({
        customerId: doc.customerId,
        taskType: bucket.taskType,
        title,
        dueDate: doc.expiryDate,
        assignedToId: customer.assignedAgentId ?? doc.uploadedById,
      });

      if (created) {
        if (bucket.type === "PASSPORT") result.passportTasksCreated++;
        else result.visaTasksCreated++;
      }
    }
  }

  return result;
}

async function createExpiryTaskIdempotent(params: {
  customerId: string;
  taskType: TaskType;
  title: string;
  dueDate: Date;
  assignedToId: string;
}): Promise<boolean> {
  // Pre-check keeps sequential re-runs idempotent. For OTHER (visa) the title is
  // the dedupe key; for PASSPORT_EXPIRY the DB partial unique index also guards.
  const existing = await db.task.findFirst({
    where: {
      customerId: params.customerId,
      type: params.taskType,
      status: "OPEN",
      ...(params.taskType === "OTHER" ? { title: params.title } : {}),
    },
    select: { id: true },
  });
  if (existing) return false;

  try {
    await db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: params.title,
          dueDate: params.dueDate,
          type: params.taskType,
          status: "OPEN",
          customerId: params.customerId,
          assignedToId: params.assignedToId,
        },
      });
      await logAudit(
        {
          actorId: null, // system / cron
          action: "task.create",
          entity: "Task",
          entityId: task.id,
          before: null,
          after: {
            reason: "document-expiry-sweep",
            type: params.taskType,
            customerId: params.customerId,
          },
        },
        tx,
      );
    });
    return true;
  } catch (err) {
    // Concurrent double-fire hit the unique index — already handled, not an error.
    if (err && typeof err === "object" && (err as { code?: unknown }).code === "P2002") {
      return false;
    }
    throw err;
  }
}
