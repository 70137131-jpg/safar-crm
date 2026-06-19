"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  createQuotationSchema,
  updateQuotationSchema,
  sendQuotationSchema,
  acceptQuotationSchema,
  listQuotationsSchema,
} from "./quotations.schemas";
import type { QuotationDTO, QuotationListItem, PaginatedResult } from "./quotations.types";
import * as service from "./quotations.service";

/**
 * Quotations server actions.
 * requireUser() → Zod parse → service (requirePermission) → ActionResult.
 */

export const createQuotationAction = serverAction(
  "quotations.create",
  async (formData: Record<string, unknown>): Promise<QuotationDTO> => {
    const user = await requireUser();
    const input = createQuotationSchema.parse(formData);
    return service.createQuotation(user, input);
  },
);

export const updateQuotationAction = serverAction(
  "quotations.update",
  async (id: string, formData: Record<string, unknown>): Promise<QuotationDTO> => {
    const user = await requireUser();
    const input = updateQuotationSchema.parse(formData);
    return service.updateQuotation(user, id, input);
  },
);

export const sendQuotationAction = serverAction(
  "quotations.send",
  async (id: string, formData: Record<string, unknown>): Promise<QuotationDTO> => {
    const user = await requireUser();
    const input = sendQuotationSchema.parse(formData);
    return service.sendQuotation(user, id, input);
  },
);

export const acceptQuotationAction = serverAction(
  "quotations.accept",
  async (id: string, formData: Record<string, unknown>): Promise<QuotationDTO> => {
    const user = await requireUser();
    const input = acceptQuotationSchema.parse(formData);
    return service.acceptQuotation(user, id, input);
  },
);

export const getQuotationAction = serverAction(
  "quotations.get",
  async (id: string): Promise<QuotationDTO> => {
    const user = await requireUser();
    return service.getQuotation(user, id);
  },
);

export const listQuotationsAction = serverAction(
  "quotations.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<QuotationListItem>> => {
    const user = await requireUser();
    const input = listQuotationsSchema.parse(params);
    return service.listQuotations(user, input);
  },
);
