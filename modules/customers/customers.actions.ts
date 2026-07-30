"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction, ValidationError } from "@/lib/errors";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersSchema,
  MAX_IMPORT_ROWS,
  customerImportRequestSchema,
} from "./customers.schemas";
import type {
  CustomerDTO,
  CustomerListItem,
  PaginatedResult,
  ImportResult,
  ImportRunDTO,
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

export const importCustomersAction = serverAction(
  "customers.import",
  async (input: { fileName: string; fileType: string; rows: Record<string, unknown>[] }): Promise<ImportResult> => {
    const user = await requireUser();
    const request = customerImportRequestSchema.parse(input);
    const rawRows = request.rows;
    if (rawRows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(
        `Import exceeds the ${MAX_IMPORT_ROWS.toLocaleString()}-row limit. Split the file and try again.`,
      );
    }
    return service.importCustomers(user, rawRows, {
      fileName: request.fileName,
      fileType: request.fileType,
    });
  },
);

export const listImportRunsAction = serverAction(
  "customers.importRuns",
  async (): Promise<ImportRunDTO[]> => service.listImportRuns(await requireUser()),
);
