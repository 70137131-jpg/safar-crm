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
  // Direct (non-pooled) URL — migrations + admin scripts only (lib/db-direct.ts,
  // never imported at app runtime). Optional so Vercel Preview works: Neon's
  // branch-per-preview injects only DATABASE_URL, and a preview branch is already
  // migrated, so we fall back to DATABASE_URL below. Prod + CI set this explicitly.
  DIRECT_DATABASE_URL: z.string().url().optional(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be ≥ 32 chars"),
  // Optional so Vercel Preview works: preview URLs are per-deployment, so we fall
  // back to the deployment's own origin (VERCEL_URL) below. Prod + CI set the
  // canonical URL explicitly.
  BETTER_AUTH_URL: z.string().url().optional(),

  // Set by Vercel on every deployment (the deployment's own host, no protocol).
  VERCEL_URL: z.string().optional(),

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

// Resolve the two preview-friendly fallbacks. On Vercel Preview these come from
// VERCEL_URL / the pooled DATABASE_URL; everywhere else they are set explicitly.
const vercelOrigin = parsed.data.VERCEL_URL ? `https://${parsed.data.VERCEL_URL}` : undefined;
const betterAuthUrl = parsed.data.BETTER_AUTH_URL ?? vercelOrigin;

if (!betterAuthUrl) {
  console.error("❌ BETTER_AUTH_URL is required (and no VERCEL_URL fallback is available).");
  throw new Error("BETTER_AUTH_URL is required — see logs above.");
}

export const env = {
  ...parsed.data,
  BETTER_AUTH_URL: betterAuthUrl,
  DIRECT_DATABASE_URL: parsed.data.DIRECT_DATABASE_URL ?? parsed.data.DATABASE_URL,
};
export type Env = typeof env;
