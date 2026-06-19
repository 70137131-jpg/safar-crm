import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Better Auth server config.
 *
 * Our Prisma User model carries the auth identity (id, email, name, etc.)
 * plus domain fields (role, deactivatedAt, ...). Session / Account /
 * Verification tables are added by `npx @better-auth/cli generate` —
 * run it once after `pnpm install`.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7d absolute
    updateAge: 60 * 60 * 12,       // refresh after 12h
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  // Brute-force protection. Better Auth enables rate limiting by default in
  // production; we make it explicit and tighten the credential endpoints.
  // NOTE: default storage is in-memory (per-instance). On multi-instance
  // serverless (Vercel) this is per-lambda — for hard global limits, switch to
  // DB-backed storage (`storage: "database"`, requires the rateLimit table).
  // See SECURITY.md "Authentication hardening".
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },

  user: {
    modelName: "User",
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "AGENT", input: false },
      avatar: { type: "string", required: false },
      deactivatedAt: { type: "date", required: false, input: false },
      deactivatedById: { type: "string", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },

  advanced: {
    // User.id is a Postgres `uuid` column, so Better Auth must emit UUIDs
    // rather than its default base32 ids (which violate the uuid type). An
    // app-side generator (not "uuid") is required because Account/Session/
    // Verification have no DB-level id default to fall back on.
    database: { generateId: () => randomUUID() },
    cookiePrefix: "safar",
    useSecureCookies: env.NODE_ENV === "production",
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
