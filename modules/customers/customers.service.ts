import { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { withAudit, logAudit } from "@/lib/audit";
import { normalizePakistaniPhone } from "@/lib/phone/normalize";
import { db } from "@/lib/db";
import * as repo from "./customers.repository";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersInput,
  SearchCustomersInput,
  ImportCustomerRow,
} from "./customers.schemas";
import { importCustomerRowSchema } from "./customers.schemas";
import type {
  CustomerDTO,
  CustomerListItem,
  PaginatedResult,
  ImportResult,
  ImportRowResult,
  ImportRunDTO,
} from "./customers.types";

/**
 * Customers service — business logic, validations, audit logging.
 *
 * Rules:
 *   - Takes UserContext as first arg, never reads cookies()/headers().
 *   - Orchestrates repository + audit; repositories own DB calls.
 *   - All mutations wrapped with withAudit().
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDTO(record: NonNullable<Awaited<ReturnType<typeof repo.findById>>>): CustomerDTO {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    nationality: record.nationality,
    passportNo: record.passportNo,
    passportExpiry: record.passportExpiry,
    dob: record.dob,
    address: record.address,
    notes: record.notes,
    assignedAgentId: record.assignedAgentId,
    assignedAgent: record.assignedAgent,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  };
}

function toListItem(record: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  passportExpiry: Date | null;
  assignedAgentId: string | null;
  assignedAgent: { id: string; name: string } | null;
  createdAt: Date;
  deletedAt: Date | null;
}): CustomerListItem {
  return { ...record };
}

function ownershipScope(user: UserContext): string | undefined {
  return user.role === "AGENT" ? user.id : undefined;
}

// ─── Service functions ──────────────────────────────────────────────────────

export async function createCustomer(
  user: UserContext,
  input: CreateCustomerInput,
): Promise<CustomerDTO> {
  requirePermission(user, "customers:create");

  // Normalize phone
  const phone = input.phone ? normalizePakistaniPhone(input.phone) : null;

  // Check duplicates
  if (input.email) {
    const exists = await repo.existsByEmail(input.email);
    if (exists) throw new ConflictError("A customer with this email already exists");
  }
  if (phone) {
    const exists = await repo.existsByPhone(phone);
    if (exists) throw new ConflictError("A customer with this phone number already exists");
  }

  // AGENT: auto-assign to themselves if not specified
  const assignedAgentId =
    input.assignedAgentId ?? (user.role === "AGENT" ? user.id : undefined);

  const result = await withAudit(
    {
      actorId: user.id,
      action: "customer.create",
      entity: "Customer",
      before: null,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: CustomerDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.create(
        {
          name: input.name,
          email: input.email ?? null,
          phone,
          nationality: input.nationality ?? null,
          passportNo: input.passportNo ?? null,
          passportExpiry: input.passportExpiry ?? null,
          dob: input.dob ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          ...(assignedAgentId
            ? { assignedAgent: { connect: { id: assignedAgentId } } }
            : {}),
        },
        tx,
      );
      return toDTO(record);
    },
  );

  return result;
}

export async function updateCustomer(
  user: UserContext,
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Customer not found");

  requirePermission(user, "customers:update", existing);

  // Normalize phone
  const phone = input.phone ? normalizePakistaniPhone(input.phone) : null;

  // Check duplicates (exclude current record)
  if (input.email) {
    const exists = await repo.existsByEmail(input.email, id);
    if (exists) throw new ConflictError("A customer with this email already exists");
  }
  if (phone) {
    const exists = await repo.existsByPhone(phone, id);
    if (exists) throw new ConflictError("A customer with this phone number already exists");
  }

  const before = toDTO(existing);

  const result = await withAudit(
    {
      actorId: user.id,
      action: "customer.update",
      entity: "Customer",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: CustomerDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.update(
        id,
        {
          name: input.name,
          email: input.email ?? null,
          phone,
          nationality: input.nationality ?? null,
          passportNo: input.passportNo ?? null,
          passportExpiry: input.passportExpiry ?? null,
          dob: input.dob ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          assignedAgent: input.assignedAgentId
            ? { connect: { id: input.assignedAgentId } }
            : { disconnect: true },
        },
        tx,
      );
      return toDTO(record);
    },
  );

  return result;
}

export async function deleteCustomer(
  user: UserContext,
  id: string,
): Promise<CustomerDTO> {
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Customer not found");

  requirePermission(user, "customers:delete", existing);

  const before = toDTO(existing);

  const result = await withAudit(
    {
      actorId: user.id,
      action: "customer.delete",
      entity: "Customer",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: CustomerDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.softDelete(id, tx);
      return toDTO(record);
    },
  );

  return result;
}

export async function restoreCustomer(
  user: UserContext,
  id: string,
): Promise<CustomerDTO> {
  const existing = await repo.findById(id, { includeDeleted: true });
  if (!existing) throw new NotFoundError("Customer not found");
  if (!existing.deletedAt) throw new ValidationError("Customer is not deleted");

  requirePermission(user, "customers:delete"); // restore requires delete perm

  // Check duplicates again — email/phone might have been re-used since deletion
  if (existing.email) {
    const conflict = await repo.existsByEmail(existing.email, id);
    if (conflict)
      throw new ConflictError(
        "Cannot restore: a customer with this email already exists",
      );
  }
  if (existing.phone) {
    const conflict = await repo.existsByPhone(existing.phone, id);
    if (conflict)
      throw new ConflictError(
        "Cannot restore: a customer with this phone already exists",
      );
  }

  const before = toDTO(existing);

  const result = await withAudit(
    {
      actorId: user.id,
      action: "customer.restore",
      entity: "Customer",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: (r: CustomerDTO) => r.id,
    },
    async (tx) => {
      const record = await repo.restore(id, tx);
      return toDTO(record);
    },
  );

  return result;
}

export async function getCustomer(
  user: UserContext,
  id: string,
): Promise<CustomerDTO> {
  requirePermission(user, "customers:view");

  const record = await repo.findById(id);
  if (!record) throw new NotFoundError("Customer not found");

  // Ownership check for AGENT
  if (user.role === "AGENT" && record.assignedAgentId !== user.id) {
    throw new NotFoundError("Customer not found");
  }

  return toDTO(record);
}

export async function listCustomers(
  user: UserContext,
  input: ListCustomersInput,
): Promise<PaginatedResult<CustomerListItem>> {
  requirePermission(user, "customers:view");

  // includeDeleted only for ADMIN/MANAGER
  const includeDeleted =
    input.includeDeleted && (user.role === "ADMIN" || user.role === "MANAGER");

  const { items, total } = await repo.findMany({
    page: input.page,
    pageSize: input.pageSize,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    search: input.search,
    includeDeleted,
    assignedAgentId: ownershipScope(user),
  });

  return {
    items: items.map(toListItem),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export async function listDeletedCustomers(
  user: UserContext,
  page: number = 1,
  pageSize: number = 50,
): Promise<PaginatedResult<CustomerListItem>> {
  requirePermission(user, "customers:delete");

  const { items, total } = await repo.findDeleted({
    page,
    pageSize,
    assignedAgentId: ownershipScope(user),
  });

  return {
    items: items.map(toListItem),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function searchCustomers(
  user: UserContext,
  input: SearchCustomersInput,
): Promise<PaginatedResult<CustomerListItem>> {
  requirePermission(user, "customers:view");

  const { items, total } = await repo.search({
    query: input.query,
    page: input.page,
    pageSize: input.pageSize,
    assignedAgentId: ownershipScope(user),
  });

  return {
    items: items.map(toListItem),
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

/**
 * Maps a row-insert failure to a human message. Recognises the partial
 * unique-index violation (P2002) raised by a within-file duplicate, which the
 * pre-checks — reading already-committed rows only — can't see.
 */
function importErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return "Duplicate email or phone number (already present in this file or the database)";
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export async function importCustomers(
  user: UserContext,
  rawRows: Record<string, unknown>[],
  meta?: { fileName: string; fileType: string },
): Promise<ImportResult> {
  requirePermission(user, "customers:import");

  const results: ImportRowResult[] = [];
  const rows: Array<{ rowNumber: number; data: ImportCustomerRow }> = [];
  let successCount = 0;
  let errorCount = 0;

  for (let index = 0; index < rawRows.length; index++) {
    const parsed = importCustomerRowSchema.safeParse(rawRows[index]);
    if (parsed.success) {
      rows.push({ rowNumber: index + 1, data: parsed.data });
    } else {
      errorCount++;
      results.push({
        row: index + 1,
        success: false,
        name: String(rawRows[index]?.name ?? `Row ${index + 1}`),
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
    }
  }

  const run = meta
    ? await repo.createImportRun({
        fileName: meta.fileName,
        fileType: meta.fileType,
        totalRows: rawRows.length,
        createdById: user.id,
      })
    : null;

  // Insert in chunks of 200 (ARCHITECTURE.md §2.12). Each row runs inside a
  // SAVEPOINT so a single bad row (e.g. a within-file duplicate that trips the
  // partial unique index) rolls back on its own and the chunk transaction stays
  // usable — otherwise the first failed INSERT would abort every later row.
  const CHUNK_SIZE = 200;

  try {
    for (let chunkStart = 0; chunkStart < rows.length; chunkStart += CHUNK_SIZE) {
    const chunk = rows.slice(chunkStart, chunkStart + CHUNK_SIZE);

    await db.$transaction(async (tx) => {
      for (let i = 0; i < chunk.length; i++) {
        const item = chunk[i]!;
        const row = item.data;
        const rowNum = item.rowNumber;
        const phone = row.phone ? normalizePakistaniPhone(row.phone) : null;

        await tx.$executeRawUnsafe("SAVEPOINT import_row");
        try {
          // Friendly pre-checks against already-committed rows.
          if (row.email && (await repo.existsByEmail(row.email))) {
            throw new ConflictError(`Duplicate email: ${row.email}`);
          }
          if (phone && (await repo.existsByPhone(phone))) {
            throw new ConflictError(`Duplicate phone: ${phone}`);
          }

          const record = await repo.create(
            {
              name: row.name,
              email: row.email ?? null,
              phone,
              nationality: row.nationality ?? null,
              passportNo: row.passportNo ?? null,
              passportExpiry: row.passportExpiry ?? null,
              dob: row.dob ?? null,
              address: row.address ?? null,
              notes: row.notes ?? null,
              assignedAgent: { connect: { id: user.id } },
            },
            tx,
          );

          await logAudit(
            {
              actorId: user.id,
              action: "customer.import",
              entity: "Customer",
              entityId: record.id,
              before: null,
              after: record,
              ip: user.ip,
              userAgent: user.userAgent,
            },
            tx,
          );

          await tx.$executeRawUnsafe("RELEASE SAVEPOINT import_row");
          successCount++;
          results.push({ row: rowNum, success: true, name: row.name });
        } catch (err) {
          // Undo just this row; the rest of the chunk continues.
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT import_row");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT import_row");
          errorCount++;
          results.push({
            row: rowNum,
            success: false,
            name: row.name,
            error: importErrorMessage(err),
          });
        }
      }
    });
    }
  } catch (error) {
    if (run) {
      await repo.updateImportRun(run.id, {
        status: "FAILED",
        successCount,
        errorCount: errorCount + 1,
        errors: [
          ...results.filter((result) => !result.success),
          { row: 0, success: false, error: importErrorMessage(error) },
        ] as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      });
    }
    throw error;
  }

  const result: ImportResult = {
    ...(run ? { runId: run.id } : {}),
    totalRows: rawRows.length,
    successCount,
    errorCount,
    errors: results.filter((r) => !r.success),
  };
  if (run) {
    await repo.updateImportRun(run.id, {
      status: "COMPLETED",
      successCount,
      errorCount,
      errors: result.errors as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    });
  }
  return result;
}

export async function listImportRuns(user: UserContext): Promise<ImportRunDTO[]> {
  requirePermission(user, "customers:import");
  const rows = await repo.listImportRuns();
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    status: row.status,
    totalRows: row.totalRows,
    successCount: row.successCount,
    errorCount: row.errorCount,
    errors: Array.isArray(row.errors) ? row.errors as unknown as ImportRowResult[] : [],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));
}
