import type { PackageStatus } from "@prisma/client";

export interface PackageDTO {
  id: string;
  title: string;
  destination: string;
  description: string | null;
  durationDays: number;
  pricePaisa: bigint;
  hotel: string | null;
  included: string[];
  excluded: string[];
  status: PackageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingPackageSnapshot {
  id: string;
  title: string;
  destination: string;
  description: string | null;
  durationDays: number;
  pricePaisa: string;
  hotel: string | null;
  included: string[];
  excluded: string[];
}
