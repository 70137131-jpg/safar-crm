import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Prisma singleton.
 *
 * In dev, Next.js hot-reloads modules — without a global cache we'd leak
 * connections on every save. In serverless prod, each cold start gets a
 * fresh client backed by Neon's pooled connection.
 *
 * Use `DIRECT_DATABASE_URL` for migration scripts only (see prisma-direct.ts).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [{ level: "query", emit: "stdout" }, "error", "warn"]
        : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export type DB = typeof db;
