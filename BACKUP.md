# BACKUP.md — Safar CRM

Covers the two stateful stores: **Neon (Postgres)** and **Cloudflare R2 (documents)**. Application code/config is reproducible from Git + environment variables and needs no backup beyond the repo and a secure secret store.

---

## 1. What must be backed up

| Store | Contents | Loss impact |
|-------|----------|-------------|
| Neon Postgres | All business data + AuditLog + Better Auth sessions/accounts | Critical |
| Cloudflare R2 | Uploaded documents (passports, visas, tickets, invoices, PDFs) | Critical |
| Secret store | All env secrets (DB URLs, `BETTER_AUTH_SECRET`, R2/Resend keys, `CRON_SECRET`) | Critical (without them, restores can't run) |

The DB stores R2 **object keys**, not bytes; the two stores must be restored **consistently** (a DB restored to time *T* expects the R2 objects that existed at *T*).

---

## 2. Database backups (Neon)

**Primary mechanism — Neon Point-in-Time Restore (PITR):**
- Neon retains a history window (plan-dependent; confirm and, if possible, extend to ≥ 7 days for production). Within it you can restore the branch to any second.
- This is the first-line recovery for "someone deleted/changed data at 14:32".

**Secondary mechanism — logical dumps (defense in depth, off-platform):**
- Run a daily `pg_dump` against `DIRECT_DATABASE_URL` and store it encrypted off Neon (e.g. an R2 bucket in a different account, or another provider). Keeps you safe from account-level loss.
  ```bash
  pg_dump --no-owner --format=custom \
    "$DIRECT_DATABASE_URL" > "safar-crm-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # encrypt before upload, e.g.: age -r <recipient> -o backup.age backup.dump
  ```
- Schedule via a CI cron (GitHub Actions) or a small scheduled job. **Do not** run heavy dumps through the pooled URL.
- **Retention suggestion:** daily for 30 days, weekly for 90 days, monthly for 1 year. Adjust to data-retention policy.

**Verify backups weekly** (restore drill): restore the latest dump into a throwaway Neon branch, run migrations if needed, and run the smoke test (DEPLOYMENT §7). An untested backup is not a backup. Record each drill's date + result; automate it as a scheduled CI job that restores into an ephemeral branch and asserts row counts.

---

## 3. Document backups (R2)

- Treat R2 as the system of record for document bytes. Enable **object versioning** if available, and/or replicate the bucket on a schedule (`rclone sync` to a second bucket/provider):
  ```bash
  rclone sync r2prod:safar-crm-prod-docs r2backup:safar-crm-docs-backup
  ```
- Documents are immutable once uploaded (content-addressed keys), so incremental sync is cheap.
- Keep the backup bucket **private**.

---

## 4. Restore process

**Full restore (DR — both stores):**
1. Provision a Neon branch/project and restore the chosen snapshot (PITR) or load the latest `pg_dump`:
   ```bash
   pg_restore --no-owner --clean --if-exists -d "$DIRECT_DATABASE_URL" backup.dump
   ```
2. Restore R2 objects from the backup bucket **as of the same timestamp** as the DB snapshot.
3. Re-create the `crm_app` role on the restored DB and re-apply grants (the audit append-only block) — see DEPLOYMENT §1.3 and RUNBOOK.
4. Point the app's env at the restored stores; redeploy; run the smoke test.
5. Invalidate sessions if the restore predates a credential change: rotate `BETTER_AUTH_SECRET`.

**Partial restore (a few rows clobbered):**
- Prefer **PITR into a scratch branch**, export only the affected rows, and re-apply to production. Avoid restoring the whole production DB for a localized mistake.
- Cross-check `AuditLog` (`entity`, `entityId`) to reconstruct the correct prior values.

**Document-only restore:**
- Copy the missing keys from the backup bucket back into the live bucket. The DB rows already reference the keys.

---

## 5. RPO / RTO targets (suggested — confirm with the business)

| Metric | Target |
|--------|--------|
| RPO (max data loss) | ≤ 24h via daily dump; near-zero within Neon PITR window |
| RTO (time to restore) | ≤ 2h for full DR; ≤ 30m for PITR scratch-branch partial restore |

---

## 6. Backups & PII

- Dumps and R2 backups contain PII (passport numbers, DOB). **Encrypt at rest**, restrict access to the same people who can access production, and apply the same retention/erasure policy. Never download a production dump to an unmanaged laptop.
