"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  createLeadSchema,
  updateLeadSchema,
  listLeadsSchema,
  kanbanLeadsSchema,
  changeLeadStatusSchema,
  assignLeadSchema,
  convertLeadSchema,
} from "./leads.schemas";
import type {
  LeadDTO,
  LeadListItem,
  LeadStatusEventDTO,
  KanbanColumns,
  PaginatedResult,
  ConvertResult,
} from "./leads.types";
import * as service from "./leads.service";

/**
 * Leads server actions. Each: requireUser() → Zod parse → service
 * (which authorizes via requirePermission) → typed ActionResult.
 */

export const createLeadAction = serverAction(
  "leads.create",
  async (formData: Record<string, unknown>): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.createLead(user, createLeadSchema.parse(formData));
  },
);

export const updateLeadAction = serverAction(
  "leads.update",
  async (id: string, formData: Record<string, unknown>): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.updateLead(user, id, updateLeadSchema.parse(formData));
  },
);

export const getLeadAction = serverAction(
  "leads.get",
  async (id: string): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.getLead(user, id);
  },
);

export const listLeadsAction = serverAction(
  "leads.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<LeadListItem>> => {
    const user = await requireUser();
    return service.listLeads(user, listLeadsSchema.parse(params));
  },
);

export const getKanbanAction = serverAction(
  "leads.kanban",
  async (params: Record<string, unknown>): Promise<KanbanColumns> => {
    const user = await requireUser();
    return service.getKanban(user, kanbanLeadsSchema.parse(params));
  },
);

export const changeLeadStatusAction = serverAction(
  "leads.changeStatus",
  async (id: string, formData: Record<string, unknown>): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.changeStatus(user, id, changeLeadStatusSchema.parse(formData));
  },
);

export const assignLeadAction = serverAction(
  "leads.assign",
  async (id: string, formData: Record<string, unknown>): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.assignLead(user, id, assignLeadSchema.parse(formData));
  },
);

export const deleteLeadAction = serverAction(
  "leads.delete",
  async (id: string): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.deleteLead(user, id);
  },
);

export const restoreLeadAction = serverAction(
  "leads.restore",
  async (id: string): Promise<LeadDTO> => {
    const user = await requireUser();
    return service.restoreLead(user, id);
  },
);

export const convertLeadAction = serverAction(
  "leads.convert",
  async (id: string, formData: Record<string, unknown>): Promise<ConvertResult> => {
    const user = await requireUser();
    return service.convertLead(user, id, convertLeadSchema.parse(formData));
  },
);

export const getLeadHistoryAction = serverAction(
  "leads.history",
  async (id: string): Promise<LeadStatusEventDTO[]> => {
    const user = await requireUser();
    return service.getLeadHistory(user, id);
  },
);
