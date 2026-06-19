# DEPLOYMENT.md — Safar CRM

Target platform: **Vercel** (Next.js 16) + **Neon** (PostgreSQL) + **Cloudflare R2** (documents) + **Resend** (email). Single tenant, single region (deploy close to Neon — e.g. Frankfurt/`fra1` or the region nearest Pakistan users).

> Read SECURITY.md §8 (hardening checklist) and the RUNBOOK before the first production deploy. The single most important non-obvious step is creating the **`crm_app`** DB role so the audit log is truly append-only.

---

## 0. Prerequisites

- Node ≥ 20 (`.nvmrc` pins the version), `pnpm`.
- Accounts: Vercel, Neon, Cloudflare (R2), Resend, Sentry.
- A clone of this repo connected to a Git remote Vercel can import.

---

## 1. Neon (database)

1. Create a Neon project. Note the region; create a **production** branch (and keep `main` as the long-lived branch). Use separate Neon **branches** per environment (preview branches are cheap and isolated).
2. Capture **two** connection strings:
   - **Pooled** (PgBouncer) → `DATABASE_URL`, append `?sslmode=require&pgbouncer=true&connection_limit=1` (serverless-safe).
   - **Direct** (non-pooled) → `DIRECT_DATABASE_URL`, `?sslmode=require` (migrations + scripts).
3. **Create the least-privilege runtime role (required for audit immutability):**
   ```sql
   -- as the Neon owner/admin role:
   CREATE ROLE crm_app WITH LOGIN PASSWORD '<strong-random>';
   GRANT CONNECT ON DATABASE <db> TO crm_app;
   GRANT USAGE ON SCHEMA public TO crm_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO crm_app;
   ```
   Then set the **runtime** `DATABASE_URL` to connect as `crm_app`, and keep `DIRECT_DATABASE_URL` (migrations) as the **owner**. The init migration's `DO $$ ... crm_app ...$$` block will then `REVOKE UPDATE, DELETE ON "AuditLog"` from `crm_app`, making the audit trail append-only. **Verify** (RUNBOOK → AuditLog immutability).
4. Apply migrations against production (uses the direct URL):
   ```bash
   DIRECT_DATABASE_URL=... pnpm prisma:deploy   # prisma migrate deploy
   ```
5. Seed the first ADMIN (one-off, with `SEED_ADMIN_*` set):
   ```bash
   pnpm seed
   ```

## 2. Cloudflare R2 (documents)

1. Create **one private bucket per environment** (e.g. `safar-crm-prod-docs`). **No public access** — the app only ever serves bytes via 5-minute signed URLs.
2. Create an R2 API token (Object Read & Write) scoped to that bucket. Capture `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DOCUMENTS`.
3. (Optional) Configure a lifecycle rule to clean up incomplete multipart uploads.
4. CORS: allow `PUT` from your app origin for presigned browser uploads, e.g.:
   ```json
   [{ "AllowedOrigins": ["https://<your-domain>"], "AllowedMethods": ["PUT"],
     "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```

## 3. Resend (email)

1. Verify your sending domain in Resend (SPF/DKIM DNS records).
2. Create an API key → `RESEND_API_KEY`. Set `EMAIL_FROM` to a verified address.
3. All app email flows through the **transactional outbox** (DB row → drain cron → Resend). If `RESEND_API_KEY`/`EMAIL_FROM` are unset, the drain logs `outbox.drain_skipped_no_email_config` and no-ops (safe).

## 4. Sentry

1. Create a project; capture `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client), plus `SENTRY_ORG`/`SENTRY_PROJECT` for source-map upload.
2. Sentry is **enabled only when `NODE_ENV=production`**.

## 5. Vercel (app)

1. Import the repo. Framework preset: Next.js. Build command `pnpm build`; install `pnpm install`.
2. **Environment variables** (Production + Preview) — every key in `.env.example`:
   - `DATABASE_URL` (pooled, `crm_app`), `DIRECT_DATABASE_URL` (direct, owner)
   - `BETTER_AUTH_SECRET` (`openssl rand -base64 48`), `BETTER_AUTH_URL` = `https://<domain>`, `NEXT_PUBLIC_BETTER_AUTH_URL` = same
   - `R2_*`, `RESEND_API_KEY`, `EMAIL_FROM`
   - `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`
   - `CRON_SECRET` (`openssl rand -hex 32`) — Vercel Cron auto-sends it as `Authorization: Bearer <CRON_SECRET>`
   - `LOG_LEVEL=info`, `NODE_ENV=production`
3. **Migrations on deploy:** run `prisma migrate deploy` as a pre-build/deploy step (e.g. a Vercel build command `prisma migrate deploy && next build`, using `DIRECT_DATABASE_URL`). Never run `migrate dev` in CI.
4. **Cron:** `vercel.json` already declares all six jobs:
   | Path | Schedule (UTC) |
   |------|----------------|
   | `/api/cron/drain-email-outbox` | `*/5 * * * *` |
   | `/api/cron/sweep-reminders` | `*/15 * * * *` |
   | `/api/cron/sweep-document-expiry` | `0 1 * * *` |
   | `/api/cron/sweep-passport-expiry` | `0 1 * * *` |
   | `/api/cron/sweep-payment-due` | `0 2 * * *` |
   | `/api/cron/sweep-quotation-expiry` | `0 3 * * *` |
5. Region: set Vercel function region close to Neon to minimize DB latency.

## 6. Preview deployments

- Each PR should deploy to a Vercel Preview backed by a **Neon preview branch** (isolated DB) with its own seeded ADMIN. Set preview env vars accordingly. This satisfies TASKS §0.12 (throwaway PR → working preview).

## 7. Post-deploy smoke test

1. `GET /api/healthz` → 200.
2. Log in as the seeded ADMIN; confirm dashboard renders.
3. Create a customer; upload a document; download it (302 → signed URL works).
4. Manually trigger a cron with the secret:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/drain-email-outbox
   ```
   Expect `{ ok: true, ... }`. A request **without** the header must return `401`.
5. Confirm a test error appears in Sentry (prod only).
6. **Verify AuditLog immutability** (RUNBOOK).

## 8. Rollback

- **App:** re-promote the previous Vercel deployment (instant).
- **DB:** migrations are forward-only. To roll back schema, restore a Neon branch/PITR snapshot (see BACKUP.md) — do **not** hand-edit migration history. Prefer a forward fix-migration where possible.
