"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import { createInvoiceSchema, voidInvoiceSchema, listInvoicesSchema } from "./invoices.schemas";
import type { InvoiceDTO, InvoiceListItem, PaginatedResult } from "./invoices.types";
import * as service from "./invoices.service";

/**
 * Invoices server actions.
 * requireUser() → Zod parse → service (requirePermission) → ActionResult.
 */

export const createInvoiceAction = serverAction(
  "invoices.create",
  async (formData: Record<string, unknown>): Promise<InvoiceDTO> => {
    const user = await requireUser();
    const input = createInvoiceSchema.parse(formData);
    return service.createInvoice(user, input);
  },
);

export const markInvoicePaidAction = serverAction(
  "invoices.markPaid",
  async (id: string): Promise<InvoiceDTO> => {
    const user = await requireUser();
    return service.markInvoicePaid(user, id);
  },
);

export const voidInvoiceAction = serverAction(
  "invoices.void",
  async (id: string, formData: Record<string, unknown>): Promise<InvoiceDTO> => {
    const user = await requireUser();
    const input = voidInvoiceSchema.parse(formData);
    return service.voidInvoice(user, id, input);
  },
);

export const getInvoiceAction = serverAction(
  "invoices.get",
  async (id: string): Promise<InvoiceDTO> => {
    const user = await requireUser();
    return service.getInvoice(user, id);
  },
);

export const listInvoicesAction = serverAction(
  "invoices.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<InvoiceListItem>> => {
    const user = await requireUser();
    const input = listInvoicesSchema.parse(params);
    return service.listInvoices(user, input);
  },
);
