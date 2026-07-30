"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import { createPackageSchema, packageIdSchema, updatePackageSchema } from "./packages.schemas";
import type { PackageDTO } from "./packages.types";
import * as service from "./packages.service";

export const listPackagesAction = serverAction("packages.list", async (): Promise<PackageDTO[]> => {
  return service.listPackages(await requireUser());
});

export const listActivePackagesAction = serverAction("packages.listActive", async (): Promise<PackageDTO[]> => {
  return service.listActivePackages(await requireUser());
});

export const createPackageAction = serverAction(
  "packages.create",
  async (input: Record<string, unknown>): Promise<PackageDTO> =>
    service.createPackage(await requireUser(), createPackageSchema.parse(input)),
);

export const updatePackageAction = serverAction(
  "packages.update",
  async (id: string, input: Record<string, unknown>): Promise<PackageDTO> =>
    service.updatePackage(await requireUser(), packageIdSchema.parse(id), updatePackageSchema.parse(input)),
);
