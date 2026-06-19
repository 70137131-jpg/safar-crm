"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import {
  testEmailSchema,
  updateAgencySchema,
  updateEmailSchema,
  updateNotificationsSchema,
} from "./settings.schemas";
import type { SettingsDTO } from "./settings.types";
import * as service from "./settings.service";

export const getSettingsAction = serverAction(
  "settings.get",
  async (): Promise<SettingsDTO> => {
    const user = await requireUser();
    return service.getSettings(user);
  },
);

export const updateAgencyAction = serverAction(
  "settings.updateAgency",
  async (input: Record<string, unknown>): Promise<SettingsDTO> => {
    const user = await requireUser();
    const parsed = updateAgencySchema.parse(input);
    return service.updateAgency(user, parsed);
  },
);

export const updateEmailAction = serverAction(
  "settings.updateEmail",
  async (input: Record<string, unknown>): Promise<SettingsDTO> => {
    const user = await requireUser();
    const parsed = updateEmailSchema.parse(input);
    return service.updateEmail(user, parsed);
  },
);

export const updateNotificationsAction = serverAction(
  "settings.updateNotifications",
  async (input: Record<string, unknown>): Promise<SettingsDTO> => {
    const user = await requireUser();
    const parsed = updateNotificationsSchema.parse(input);
    return service.updateNotifications(user, parsed);
  },
);

export const sendTestEmailAction = serverAction(
  "settings.testEmail",
  async (input: Record<string, unknown>): Promise<{ sent: true; to: string }> => {
    const user = await requireUser();
    const parsed = testEmailSchema.parse(input);
    return service.sendTestEmail(user, parsed);
  },
);
