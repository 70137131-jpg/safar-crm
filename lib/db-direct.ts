import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Non-pooled Prisma client for migrations and one-off admin scripts.
 * Do NOT import this from the app — use `db` from ./db instead.
 */
export const dbDirect = new PrismaClient({
  datasources: { db: { url: env.DIRECT_DATABASE_URL } },
});
