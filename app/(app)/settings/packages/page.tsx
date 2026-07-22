import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPackagesAction } from "@/modules/packages/packages.actions";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { PackageManager } from "./PackageManager";

export const metadata: Metadata = { title: "Packages" };

export default async function PackagesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings:update")) notFound();
  const result = await listPackagesAction();
  if (!result.ok) notFound();
  return <PackageManager initialPackages={result.data} />;
}
