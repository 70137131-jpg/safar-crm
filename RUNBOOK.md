# RUNBOOK.md — Safar CRM Operations

Day-2 operations: go-live checks, secret rotation, incident response, cron operations, and routine maintenance. Pairs with DEPLOYMENT.md, BACKUP.md, SECURITY.md.

---

## 1. Go-live checklist

- [ ] All env vars set in Vercel (Production) — see DEPLOYMENT §5.
- [ ] `prisma migrate deploy` applied to the production DB.
- [ ] First ADMIN seeded; password changed on first login (`mustChangePassword`).
- [ ] **`crm_app` role created; runtime connects as it; AuditLog immutability verified** (§3).
- [ ] R2 bucket is **private**; CORS allows app-origin `PUT`.
- [ ] Resend sending domain verified; `EMAIL_FROM` set.
- [ ] `CRON_SECRET` set; an unauthenticated `/api/cron/*` call returns `401`.
- [ ] Sentry receiving events (server + client) in production.
- [ ] `GET /api/healthz` → 200; uptime monitor configured.
- [ ] Backups scheduled (Neon PITR confirmed + daily dump + R2 sync) — BACKUP.md.

---

## 2. Key facts

- **App:** Vercel (Next.js 16). Rollback = re-promote previous deployment.
- **DB:** Neon Postgres. Pooled URL at runtime (`crm_app`), direct URL for migrations (owner).
- **Files:** Cloudflare R2 private bucket; bytes leave only via 5-min signed URLs through `/api/documents/[id]/download`.
- **Email:** Resend via the DB outbox; `drain-email-outbox` cron every 5 min.
- **Authz:** enforced in services (`requirePermission`/`can`), not middleware.
- **Audit:** every mutation writes an `AuditLog` row in-transaction.

---

## 3. AuditLog immutability — verify & repair

**Why:** the append-only guarantee only applies if the app connects as `crm_app` and the REVOKE ran (SECURITY.md §6).

**Verify** (connect as `crm_app`):
```sql
-- should succeed:
SELECT count(*) FROM "AuditLog";
-- should FAIL with "permission denied for table AuditLog":
UPDATE "AuditLog" SET action = 'tamper' WHERE id = (SELECT id FROM "AuditLog" LIMIT 1);
DELETE FROM "AuditLog" WHERE false;
```
If the UPDATE/DELETE **succeed**, immutability is NOT active. **Repair** (as owner):
```sql
REVOKE UPDATE, DELETE ON "AuditLog" FROM crm_app;
GRANT INSERT, SELECT ON "AuditLog" TO crm_app;
```
Then confirm the runtime `DATABASE_URL` actually connects as `crm_app` (not the owner).

---

## 4. Secret rotation

Rotate on a schedule (e.g. quarterly) and immediately on suspected exposure. All rotations are done in the Vercel env + the provider, then redeploy.

| Secret | How to rotate | Side effects |
|--------|---------------|--------------|
| `BETTER_AUTH_SECRET` | Generate new (`openssl rand -base64 48`), set in Vercel, redeploy | **All sessions invalidated** — everyone must log in again. Use this as the "log everyone out" lever. |
| `CRON_SECRET` | `openssl rand -hex 32`, set in Vercel; Vercel Cron picks it up | Manual cron calls must use the new value |
| `crm_app` DB password | `ALTER ROLE crm_app WITH PASSWORD '...'`, update `DATABASE_URL` | Brief connection errors until redeploy |
| R2 keys | Create new R2 token, update `R2_*`, delete old token | In-flight signed URLs keep working until they expire (≤5 min) |
| `RESEND_API_KEY` | New key in Resend, update env, revoke old | Outbox retries cover any drain that fails mid-rotation |
| `DATABASE_URL`/`DIRECT_DATABASE_URL` | Rotate the Neon role password | Redeploy |

After any rotation: redeploy, then run the smoke test (DEPLOYMENT §7).

---

## 5. Incident response

**5.1 Compromised user account**
1. Settings → Users → **Deactivate** the user.
2. Delete their active sessions (instant lockout — `cookieCache` otherwise allows ≤5 min):
   ```sql
   DELETE FROM "Session" WHERE "userId" = '<id>';
   ```
3. Review their activity: `SELECT * FROM "AuditLog" WHERE "actorId" = '<id>' ORDER BY "createdAt" DESC;`
4. If credentials may be widely compromised, rotate `BETTER_AUTH_SECRET` (logs everyone out).

**5.2 Leaked secret** — rotate per §4. If it was `CRON_SECRET`, also scan logs for unauthorized `/api/cron/*` 200s.

**5.3 Suspected data tampering** — reconstruct from `AuditLog` (`entity`,`entityId` history). If §3 immutability was not active, treat audit as advisory and corroborate with Neon PITR (BACKUP.md §4 partial restore).

**5.4 Document/R2 exposure** — objects are private; signed URLs expire in ≤5 min. Rotate R2 keys (§4). Identify access via `AuditLog` `document.download` rows.

**5.5 Outage**
- App down → check Vercel status + latest deployment logs; roll back deployment.
- DB down → check Neon status; `GET /api/healthz` returns non-200 on DB failure.
- Email not sending → check `outbox.send_failed` / `outbox.drain_skipped_no_email_config` logs and Resend status; PENDING rows drain automatically once fixed (idempotent).

---

## 6. Cron operations

- Schedules: see DEPLOYMENT §5.4. All sweeps are **idempotent** and safe to re-run.
- Manual run:
  ```bash
  curl -i -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/<name>
  ```
- Health: a failing job raises a **Sentry issue tagged `cron:<name>`** and logs `cron.<name>_failed`. Re-running after a fix is safe (idempotency: `reminderSentAt` claim, partial unique reminder indexes, `FOR UPDATE SKIP LOCKED` on the outbox).
- A stuck email: inspect `EmailOutbox` (`status`, `attempts`, `lastError`). Reset a `FAILED` row to `PENDING` to retry; the next drain picks it up.

---

## 7. Routine maintenance

- **Migrations:** add a Prisma migration, test on a Neon preview branch, then `prisma migrate deploy` on production (forward-only). Never `migrate dev` against production.
- **AuditLog growth:** plan monthly partitioning past ~5M rows (noted in schema); BRIN index already keeps time-range scans cheap.
- **User offboarding:** deactivate (don't delete) — `onDelete: Restrict` guards prevent deleting users with assigned records; reassign their open leads/customers first (the deactivation guard enforces this).
- **Dependency updates:** keep Next/Prisma/Better Auth patched; re-run `pnpm typecheck`, `pnpm test`, `pnpm build`, and the Playwright suite before promoting.

---

## 8. Specific recovery procedures

### Fix R2 upload failures
- Symptoms: upload dialog errors, or `confirmUpload` fails ("Failed to inspect the uploaded file").
- Check: `R2_*` env present/correct (`IntegrationError: R2 storage is not configured` ⇒ missing vars); bucket CORS allows `PUT` from the app origin; the presigned PUT hasn't expired (5-min TTL — retry from a fresh dialog); file is within the allowlist (PDF/JPEG/PNG) and ≤ 25 MB.
- The DB `Document` row is written **only after** `headObject` confirms the object landed, so a failed upload leaves **no orphan row**. Orphaned R2 objects (object landed but confirm failed) are harmless; reclaim them with an R2 lifecycle rule for incomplete/aged unreferenced keys.

### Recover from a failed migration
- `prisma migrate deploy` applies each migration transactionally on Postgres; a failed migration rolls back. State lives in `_prisma_migrations`.
- **Fix forward (preferred):** correct the SQL or add a new migration; never hand-edit applied history.
- **Stuck/locked state:** `prisma migrate resolve --rolled-back <name>` (mark a failed migration rolled back) or `--applied <name>` (if it truly applied), then re-run `migrate deploy`.
- **Worst case:** restore the DB to just before the deploy (Neon PITR — BACKUP.md §4) and retry with a corrected migration.

### Recover a "deleted"/deactivated user
- Users are **never hard-deleted** — deactivation sets `deactivatedAt`. Restore access via Settings → Users → **Reactivate** (clears `deactivatedAt`); role and assignments are intact.
- If sessions were cleared, the user simply logs in again; if `mustChangePassword` was set, they set a new password on next login.
- Customers/Leads/Bookings use soft delete (`deletedAt`) — restore from the Trash views (ADMIN/MANAGER) or the `restore*` actions.

### Cron jobs (nothing to "restart")
- Vercel Cron is schedule-driven; a missed run self-heals on the next tick because every sweep is idempotent. Force one now by hitting the route manually (§6); change cadence by editing `vercel.json` and redeploying.

## 9. Quick diagnostics

| Symptom | First check |
|---------|-------------|
| Users can't log in | `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` correct? Rate limit tripped (5/min sign-in)? Neon up? |
| "Something went wrong" page | Sentry issue (now tagged with user id); check `error.tsx` boundary trace |
| Cron not firing | Vercel Cron logs; `CRON_SECRET` set? `vercel.json` deployed? |
| Emails not arriving | `EmailOutbox` rows + Resend dashboard + `outbox.*` logs |
| Document download 403/404 | Permission/ownership (expected for non-owners) vs missing R2 object/key |
| AGENT sees too much/little | Confirm ownership fields (`assignedAgentId`); dashboard is scoped (`scope.ts`) |
