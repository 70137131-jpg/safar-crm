import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import * as repo from "./packages.repository";
import type { CreatePackageInput, UpdatePackageInput } from "./packages.schemas";
import type { BookingPackageSnapshot, PackageDTO } from "./packages.types";

type TxClient = typeof db | Prisma.TransactionClient;
type PackageRecord = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toDTO(row: PackageRecord): PackageDTO {
  return { ...row };
}

function writeData(input: CreatePackageInput | UpdatePackageInput): Prisma.PackageUpdateInput {
  return {
    title: input.title,
    destination: input.destination,
    description: input.description ?? null,
    durationDays: input.durationDays,
    pricePaisa: input.price,
    hotel: input.hotel ?? null,
    included: input.included,
    excluded: input.excluded,
  };
}

export async function listPackages(user: UserContext): Promise<PackageDTO[]> {
  requirePermission(user, "settings:view");
  return (await repo.findMany()).map(toDTO);
}

export async function listActivePackages(user: UserContext): Promise<PackageDTO[]> {
  requirePermission(user, "bookings:create");
  return (await repo.findMany(true)).map(toDTO);
}

export async function createPackage(user: UserContext, input: CreatePackageInput): Promise<PackageDTO> {
  requirePermission(user, "settings:update");
  return withAudit(
    {
      actorId: user.id, action: "package.create", entity: "Package", before: null,
      ip: user.ip, userAgent: user.userAgent,
      entityIdFromResult: (r: PackageDTO) => r.id,
    },
    async (tx) => toDTO(await repo.create(writeData(input) as Prisma.PackageCreateInput, tx)),
  );
}

export async function updatePackage(user: UserContext, id: string, input: UpdatePackageInput): Promise<PackageDTO> {
  requirePermission(user, "settings:update");
  const existing = await repo.findById(id);
  if (!existing) throw new NotFoundError("Package not found");
  return withAudit(
    {
      actorId: user.id, action: "package.update", entity: "Package", before: toDTO(existing),
      ip: user.ip, userAgent: user.userAgent,
      entityIdFromResult: (r: PackageDTO) => r.id,
    },
    async (tx) => toDTO(await repo.update(id, { ...writeData(input), status: input.status }, tx)),
  );
}

export async function getBookablePackage(
  user: UserContext,
  id: string,
  tx: TxClient = db,
): Promise<{ pricePaisa: bigint; snapshot: BookingPackageSnapshot }> {
  requirePermission(user, "bookings:create");
  const row = await repo.findById(id, tx);
  if (!row) throw new NotFoundError("Package not found");
  if (row.status !== "ACTIVE") throw new ValidationError("Archived packages cannot be booked.");
  return {
    pricePaisa: row.pricePaisa,
    snapshot: {
      id: row.id,
      title: row.title,
      destination: row.destination,
      description: row.description,
      durationDays: row.durationDays,
      pricePaisa: row.pricePaisa.toString(),
      hotel: row.hotel,
      included: row.included,
      excluded: row.excluded,
    },
  };
}
