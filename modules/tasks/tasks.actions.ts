"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import { createTaskSchema, updateTaskSchema, assignTaskSchema, listTasksSchema } from "./tasks.schemas";
import type { TaskDTO, TaskListItem, PaginatedResult } from "./tasks.types";
import * as service from "./tasks.service";

/**
 * Tasks server actions.
 * requireUser() → Zod parse → service (requirePermission) → ActionResult.
 */

export const createTaskAction = serverAction(
  "tasks.create",
  async (formData: Record<string, unknown>): Promise<TaskDTO> => {
    const user = await requireUser();
    const input = createTaskSchema.parse(formData);
    return service.createTask(user, input);
  },
);

export const updateTaskAction = serverAction(
  "tasks.update",
  async (id: string, formData: Record<string, unknown>): Promise<TaskDTO> => {
    const user = await requireUser();
    const input = updateTaskSchema.parse(formData);
    return service.updateTask(user, id, input);
  },
);

export const completeTaskAction = serverAction(
  "tasks.complete",
  async (id: string): Promise<TaskDTO> => {
    const user = await requireUser();
    return service.completeTask(user, id);
  },
);

export const assignTaskAction = serverAction(
  "tasks.assign",
  async (id: string, formData: Record<string, unknown>): Promise<TaskDTO> => {
    const user = await requireUser();
    const input = assignTaskSchema.parse(formData);
    return service.assignTask(user, id, input);
  },
);

export const getTaskAction = serverAction(
  "tasks.get",
  async (id: string): Promise<TaskDTO> => {
    const user = await requireUser();
    return service.getTask(user, id);
  },
);

export const listTasksAction = serverAction(
  "tasks.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<TaskListItem>> => {
    const user = await requireUser();
    const input = listTasksSchema.parse(params);
    return service.listTasks(user, input);
  },
);
