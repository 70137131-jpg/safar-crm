"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  changePasswordSchema,
  changeRoleSchema,
  createUserSchema,
  listUsersSchema,
  resetPasswordSchema,
  updateProfileSchema,
  updateUserSchema,
} from "./users.schemas";
import type { AssignableAgent, PaginatedResult, UserDTO } from "./users.types";
import * as service from "./users.service";

export const listAssignableAgentsAction = serverAction(
  "users.listAssignableAgents",
  async (): Promise<AssignableAgent[]> => {
    const user = await requireUser();
    return service.listAssignableAgents(user);
  },
);

export const listUsersAction = serverAction(
  "users.list",
  async (params: Record<string, unknown>): Promise<PaginatedResult<UserDTO>> => {
    const user = await requireUser();
    const input = listUsersSchema.parse(params);
    return service.listUsers(user, input);
  },
);

export const getUserAction = serverAction(
  "users.get",
  async (id: string): Promise<UserDTO> => {
    const user = await requireUser();
    return service.getUser(user, id);
  },
);

export const getProfileAction = serverAction("users.profile", async (): Promise<UserDTO> => {
  const user = await requireUser();
  return service.getProfile(user);
});

export const createUserAction = serverAction(
  "users.create",
  async (input: Record<string, unknown>): Promise<UserDTO> => {
    const user = await requireUser();
    const parsed = createUserSchema.parse(input);
    return service.createUser(user, parsed);
  },
);

export const updateUserAction = serverAction(
  "users.update",
  async (id: string, input: Record<string, unknown>): Promise<UserDTO> => {
    const user = await requireUser();
    const parsed = updateUserSchema.parse(input);
    return service.updateUser(user, id, parsed);
  },
);

export const deactivateUserAction = serverAction(
  "users.deactivate",
  async (id: string): Promise<UserDTO> => {
    const user = await requireUser();
    return service.deactivateUser(user, id);
  },
);

export const reactivateUserAction = serverAction(
  "users.reactivate",
  async (id: string): Promise<UserDTO> => {
    const user = await requireUser();
    return service.reactivateUser(user, id);
  },
);

export const changeRoleAction = serverAction(
  "users.changeRole",
  async (id: string, input: Record<string, unknown>): Promise<UserDTO> => {
    const user = await requireUser();
    const parsed = changeRoleSchema.parse(input);
    return service.changeRole(user, id, parsed.role);
  },
);

export const resetPasswordAction = serverAction(
  "users.resetPassword",
  async (id: string, input: Record<string, unknown>): Promise<UserDTO> => {
    const user = await requireUser();
    const parsed = resetPasswordSchema.parse(input);
    return service.resetPassword(user, id, parsed);
  },
);

export const updateProfileAction = serverAction(
  "users.updateProfile",
  async (input: Record<string, unknown>): Promise<UserDTO> => {
    const user = await requireUser();
    const parsed = updateProfileSchema.parse(input);
    return service.updateProfile(user, parsed);
  },
);

export const changePasswordAction = serverAction(
  "users.changePassword",
  async (input: Record<string, unknown>): Promise<UserDTO> => {
    const user = await requireUser();
    const parsed = changePasswordSchema.parse(input);
    return service.changePassword(user, parsed);
  },
);
