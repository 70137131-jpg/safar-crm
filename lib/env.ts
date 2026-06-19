import { z } from "zod";

/**
 * Validates `process.env` at boot. The app refuses to start on invalid env.
 *
 * Add new entries here AND to `.env.example`. Treat the export as the source
 * of truth — never read `process.env.XYZ` directly elsewhere.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be ≥ 32 chars"),
  BETTER_AUTH_URL: z.string().url(),

  // Sentry (optional in dev)
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),

  // R2 (optional until documents module ships)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_DOCUMENTS: z.string().optional(),
  R2_PUBLIC_HOST: z.string().optional(),

  // Resend
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Cron
  CRON_SECRET: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // Seed
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables — see logs above.");
}

export const env = parsed.data;
export type Env = typeof env;
