"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction, ValidationError } from "@/lib/errors";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  searchCustomersSchema,
  importCustomerRowSchema,
  MAX_IMPORT_ROWS,
} from "./customers.schemas";
import type {
  CustomerDTO,
  CustomerListItem,
  PaginatedResult,
  ImportResult,
} from "./customers.types";
import * as service from "./customers.service";

/**
 * Customers server actions.
 *
 * Every action:
 *   1. requireUser() — loads session
 *   2. Zod parse — validates input
 *   3. Delegates to service (which calls requirePermission())
 *   4. Returns typed ActionResult
 */

export const createCustomerAction = serverAction(
  "customers.create",
  async (formData: Record<string, unknown>): Promise<CustomerDTO> => {
    const user = await requireUser();
    const input = createCustomerSchema.parse(formData);
    return service.createCustomer(user, input);
  },
);

export const updateCustomerAction = serverAction(
  "customers.update",
  async (
    id: string,
    formData: Record<string, unknown>,
  ): Promise<CustomerDTO> => {
    const user = await requireUser();
    const input = updateCustomerSchema.parse(formData);
    return service.updateCustomer(user, id, input);
  },
);

export const deleteCustomerAction = serverAction(
  "customers.delete",
  async (id: string): Promise<CustomerDTO> => {
    const user = await requireUser();
    return service.deleteCustomer(user, id);
  },
);

export const restoreCustomerAction = serverAction(
  "customers.restore",
  async (id: string): Promise<CustomerDTO> => {
    const user = await requireUser();
    return service.restoreCustomer(user, id);
  },
);

export const getCustomerAction = serverAction(
  "customers.get",
  async (id: string): Promise<CustomerDTO> => {
    const user = await requireUser();
    return service.getCustomer(user, id);
  },
);

export const listCustomersAction = serverAction(
  "customers.list",
  async (
    params: Record<string, unknown>,
  ): Promise<PaginatedResult<CustomerListItem>> => {
    const user = await requireUser();
    const input = listCustomersSchema.parse(params);
    return service.listCustomers(user, input);
  },
);

export const listDeletedCustomersAction = serverAction(
  "customers.listDeleted",
  async (
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedResult<CustomerListItem>> => {
    const user = await requireUser();
    return service.listDeletedCustomers(user, page ?? 1, pageSize ?? 50);
  },
);

export const searchCustomersAction = serverAction(
  "customers.search",
  async (
    params: Record<string, unknown>,
  ): Promise<PaginatedResult<CustomerListItem>> => {
    const user = await requireUser();
    const input = searchCustomersSchema.parse(params);
    return service.searchCustomers(user, input);
  },
);

export const importCustomersAction = serverAction(
  "customers.import",
  async (rawRows: Record<string, unknown>[]): Promise<ImportResult> => {
    const user = await requireUser();
    if (rawRows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(
        `Import exceeds the ${MAX_IMPORT_ROWS.toLocaleString()}-row limit. Split the file and try again.`,
      );
    }
    // Validate each row individually — collect valid ones
    const validRows = [];
    const errors: ImportResult["errors"] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const parsed = importCustomerRowSchema.safeParse(rawRows[i]);
      if (parsed.success) {
        validRows.push(parsed.data);
      } else {
        errors.push({
          row: i + 1,
          success: false,
          error: parsed.error.issues.map((iss) => iss.message).join("; "),
          name: (rawRows[i] as Record<string, string>)?.name ?? `Row ${i + 1}`,
        });
      }
    }
    const result = await service.importCustomers(user, validRows);
    // Merge validation errors with import errors
    return {
      totalRows: rawRows.length,
      successCount: result.successCount,
      errorCount: result.errorCount + errors.length,
      errors: [...errors, ...result.errors],
    };
  },
);
