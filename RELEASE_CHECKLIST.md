# RELEASE_CHECKLIST.md — Safar CRM RC1

Sign-off gate for deploying to a real travel agency. **Status key:** ✅ verified (automated) · 🟢 implemented, verify manually on the seeded staging env · ⛔ blocker.

Run the seeded staging env first: `pnpm seed` (creates ADMIN + demo AGENT/MANAGER/ACCOUNTANT + demo data), then walk each module as each role.

---

## 0. Pre-flight (automated — must be green)

- [ ] `pnpm install` clean
- [ ] `pnpm prisma validate` ✅
- [ ] `pnpm lint` (no errors)
- [ ] `pnpm typecheck` ✅ (verified this session)
- [ ] `pnpm exec vitest run` → **246 passed** ✅ (verified this session)
- [ ] `pnpm build` ✅ (verified this session)
- [ ] `pnpm test:e2e` against seeded staging (auth/customers/documents green; expand per TESTING.md §6)

## 0b. Production blockers (must clear before go-live)

- [ ] ⛔ **`crm_app` DB role created; runtime connects as it; AuditLog UPDATE/DELETE denied** (SECURITY.md §6, RUNBOOK §3)
- [ ] All env vars set in Vercel prod (PROJECT_REVIEW §7)
- [ ] `CRON_SECRET` set; unauthenticated `/api/cron/*` → 401
- [ ] R2 bucket private; CORS allows app-origin PUT
- [ ] Resend domain verified; `EMAIL_FROM` set
- [ ] Sentry receiving prod events
- [ ] Backups scheduled (BACKUP.md)

---

## AUTH
- [ ] 🟢 Login (valid) — lands on dashboard (E2E ✅)
- [ ] 🟢 Logout — clears session, protected routes redirect (E2E ✅)
- [ ] 🟢 Password reset — ADMIN resets a user; `mustChangePassword` forces change on next login (no self-service email flow by design — SECURITY.md F6)
- [ ] 🟢 Session expiry — sliding 7d; deactivation takes effect within ≤5 min (or delete `Session` rows for instant — RUNBOOK §5.1)
- [ ] 🟢 Rate limit — 6th rapid bad login in a minute is throttled (SECURITY.md §5)
- [ ] Each role can log in (ADMIN/MANAGER/AGENT/ACCOUNTANT)

## CUSTOMERS
- [ ] 🟢 CRUD (create/edit/view) — AGENT auto-assigned as owner
- [ ] 🟢 Search by name/phone/email/passport-last4
- [ ] 🟢 Import CSV — 100 valid + malformed rows: valid imported, errors reported with line numbers
- [ ] 🟢 Soft delete & Restore (ADMIN/MANAGER) — deleted excluded from lists; restore checks dup email/phone
- [ ] ✅ Ownership — AGENT cannot open another agent's customer by direct ID (unit-verified)

## LEADS
- [ ] 🟢 Kanban — drag a card; status persists; OCC prevents stale overwrite
- [ ] 🟢 Interactions — log call/WhatsApp/email/note against a lead
- [ ] 🟢 Convert to Booking (and to Customer)
- [ ] 🟢 Lost flow — `lostReason` required (DB CHECK enforces)
- [ ] 🟢 Assign / reassign (ADMIN/MANAGER)

## TASKS
- [ ] 🟢 Create / Complete / Reassign
- [ ] 🟢 Overdue indicator (due date in past)
- [ ] 🟢 Passport reminders — cron creates one OPEN PASSPORT_EXPIRY task per customer (idempotent)
- [ ] 🟢 Payment reminders — cron creates one OPEN PAYMENT_DUE task per booking (idempotent)
- [ ] 🟢 Daily summary — respects Settings toggle

## BOOKINGS
- [ ] 🟢 Create (from lead or directly)
- [ ] 🟢 Status transitions (PENDING→CONFIRMED→TICKETED→COMPLETED) with events
- [ ] 🟢 Cancel — reason required (DB CHECK)
- [ ] 🟢 Balance tracking — total − Σ PAID, always derived

## PAYMENTS
- [ ] ✅ Partial / Full (unit-verified)
- [ ] ✅ Refund / partial refund (negative PAID row)
- [ ] ✅ Overpayment prevention (guard under booking row lock)
- [ ] ✅ Concurrent race safe (Σ recomputed in `FOR UPDATE` tx)
- [ ] 🟢 AGENT cash-only; no refund/void

## QUOTATIONS
- [ ] 🟢 Draft create/edit
- [ ] 🟢 Send — assigns `quoteNumber`, freezes totals (DB trigger), enqueues email
- [ ] 🟢 PDF — generated, uploaded to R2, linked via gated download
- [ ] 🟢 Email — outbox row drained by cron, links to gated page (no signed URL embedded)
- [ ] 🟢 Expiry — cron marks past-validTill SENT quotes EXPIRED (idempotent)
- [ ] ✅ Numbering format (sequence-backed, unique)

## INVOICES
- [ ] 🟢 Issue (sequence number)
- [ ] 🟢 Mark paid
- [ ] 🟢 Void
- [ ] ✅ Permissions (ACCOUNTANT/ADMIN issue/void; MANAGER view)

## DOCUMENTS
- [ ] 🟢 Upload — presigned PUT; type (PDF/JPEG/PNG) + 25 MB enforced; checksum recorded
- [ ] 🟢 Download — gated route → 302 → 5-min signed URL; audited
- [ ] ✅ Signed URLs — 5-min TTL, never emailed; private bucket
- [ ] 🟢 Expiry tracking (cron); Delete (ADMIN)

## REPORTS
- [ ] ✅ Revenue/Leads/Agents/Destinations/Payments/Tasks (unit-verified)
- [ ] 🟢 Filters — date range ≤ 1 year; agent/destination/status
- [ ] 🟢 Export — CSV / Excel / PDF download
- [ ] ✅ Scoping — AGENT own data; ACCOUNTANT financial-only

## SETTINGS
- [ ] 🟢 Users — invite/create, deactivate (guarded by open records), reactivate, change role, reset password
- [ ] 🟢 Roles — role assignment reflected immediately in permissions
- [ ] 🟢 Notifications — toggles + lead-time days honored by crons
- [ ] 🟢 Agency profile — name/address/logo/tax used in PDFs; email sender identity

---

## Post-deploy smoke (prod)
- [ ] `GET /api/healthz` → 200
- [ ] Login as ADMIN; dashboard renders
- [ ] Create customer → upload doc → download (302 works)
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/drain-email-outbox` → `{ok:true}`; no header → 401
- [ ] Test error reaches Sentry
- [ ] AuditLog immutability verified (RUNBOOK §3)

## Sign-off
- [ ] Tech Lead: code + tests + security
- [ ] Ops: deploy + backups + runbook
- [ ] Business: data-retention/PII policy acknowledged (passport/DOB stored — see SECURITY/BACKUP)
