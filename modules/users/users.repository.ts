import { randomUUID } from "node:crypto";
import type { Prisma, UserRole } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Users repository — pure data access. No business logic, no audit.
 * User identity rows (User + credential Account) are written here; the
 * service supplies the already-hashed password.
 */

type TxClient = typeof db | Prisma.TransactionClient;

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  role: true,
  deactivatedAt: true,
  emailVerified: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Active users who can own/work leads, for assignment pickers. */
export async function findAssignableAgents() {
  return db.user.findMany({
    where: { deactivatedAt: null, role: { in: ["ADMIN", "MANAGER", "AGENT"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function findById(id: string, opts?: { tx?: TxClient }) {
  const client = opts?.tx ?? db;
  return client.user.findUnique({ where: { id }, select: USER_SELECT });
}

export async function existsByEmail(email: string, excludeId?: string) {
  const count = await db.user.count({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return count > 0;
}

export async function countActiveAdmins(opts?: { excludeId?: string }) {
  return db.user.count({
    where: {
      role: "ADMIN",
      deactivatedAt: null,
      ...(opts?.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
  });
}

export interface FindManyFilters {
  page: number;
  pageSize: number;
  search?: string;
  role?: UserRole;
  status: "all" | "active" | "inactive";
}

export async function findMany(filters: FindManyFilters) {
  const where: Prisma.UserWhereInput = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status === "active"
      ? { deactivatedAt: null }
      : filters.status === "inactive"
        ? { deactivatedAt: { not: null } }
        : {}),
  };
  if (filters.search) {
    const search = filters.search.trim();
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return { items, total };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export interface CreateUserData {
  name: string;
  email: string;
  role: UserRole;
  hashedPassword: string;
  mustChangePassword: boolean;
  /** Set to create the account in a deactivated state (e.g. self-signup pending approval). */
  deactivatedAt?: Date | null;
}

/** Creates the User row + its Better Auth credential Account in one tx. */
export async function createWithCredential(data: CreateUserData, tx: TxClient = db) {
  const user = await tx.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      emailVerified: false,
      mustChangePassword: data.mustChangePassword,
      deactivatedAt: data.deactivatedAt ?? null,
    },
    select: USER_SELECT,
  });
  await tx.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: data.hashedPassword,
    },
  });
  return user;
}

export interface UpdateUserData {
  name?: string;
  avatar?: string | null;
  role?: UserRole;
  email?: string;
  deactivatedAt?: Date | null;
  deactivatedById?: string | null;
  mustChangePassword?: boolean;
  emailVerified?: boolean;
}

export async function update(id: string, data: UpdateUserData, tx: TxClient = db) {
  return tx.user.update({ where: { id }, data, select: USER_SELECT });
}

/** The current credential password hash for a user, or null if none. */
export async function findCredentialHash(userId: string): Promise<string | null> {
  const account = await db.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { password: true },
  });
  return account?.password ?? null;
}

/** Update the credential account's password hash. */
export async function updatePasswordHash(userId: string, hashedPassword: string, tx: TxClient = db) {
  await tx.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: hashedPassword },
  });
}
