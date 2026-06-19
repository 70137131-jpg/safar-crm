# SECURITY.md — Safar CRM Production Security Audit

**Audit date:** 2026-06-20
**Scope:** Better Auth config, sessions, middleware, RBAC, ownership, server actions, document access, signed URLs, cron, email outbox, audit logs.
**Method:** Static review of the actual code + migrations, with privilege-escalation / direct-URL / forged-action reasoning. Fixes applied are marked **[FIXED]**; deployment/config items are marked **[ACTION REQUIRED]**.

---

## 1. Executive summary

The codebase follows a disciplined, defense-in-depth design: authorization lives in services (not middleware), every server action runs through a single `serverAction` wrapper, money is integer paisa, PII is redacted before logs/Sentry/audit, documents are private-bucket + short-lived signed URLs, and cron endpoints are authenticated and idempotent.

The audit found **one high-severity application bug** (control-flow swallowing) and **one high-severity data-exposure** (unscoped dashboard) — both now fixed — plus a small set of deployment/config hardening items that must be completed before go-live (most importantly, the AuditLog append-only role).

| # | Severity | Area | Status |
|---|----------|------|--------|
| F1 | High | Server actions swallowed Next.js control-flow (redirect/notFound) | **[FIXED]** |
| F2 | High | Dashboard widgets leaked agency-wide data (incl. financials) to AGENT | **[FIXED]** |
| F3 | Medium | No explicit login rate-limit / lockout | **[FIXED]** (config) + see §8 |
| F4 | Medium | AuditLog append-only depends on a `crm_app` DB role that may not exist | **[ACTION REQUIRED]** |
| F5 | Low | `/reports` missing from middleware protected prefixes | **[FIXED]** |
| F6 | Low | No self-service password-reset email flow | Documented (out of scope: feature) |
| F7 | Low | Sliding 7-day session; no true 12h inactivity timeout | Documented |
| F8 | Low | `cookieCache: 5m` delays deactivation enforcement up to 5 min | Documented |
| F9 | Low | `CRON_SECRET` compared with `===` (not constant-time) | Documented |

---

## 2. What was verified sound ✅

**Middleware (`middleware.ts`)** — cookie-presence gate only; it never makes access-control decisions. This is the correct pattern for Next.js (middleware-only auth has documented bypasses). Real authorization is enforced server-side.

**RBAC (`lib/permissions/`)** — the role→permission map (`rbac.ts`) matches the required matrix exactly:
- **ADMIN** — full catalog.
- **MANAGER** — all business modules + `reports:financial`; **no `users:manage`** (cannot create/modify/deactivate users, incl. admins) but keeps `leads:assign`/`tasks:assign` (can reassign agents).
- **AGENT** — create/update/view on own customers/leads/bookings/quotations; `payments:create` (cash only, enforced in service); **no `reports:financial`**, no `*:delete`, no refund/void.
- **ACCOUNTANT** — `payments:*`, `invoices:*`, `reports:financial`; view-only on customers/leads/bookings; **no `leads:update`, no `documents:upload`, no `users:*`**.

A matrix test (`tests/unit/permissions.test.ts`, 23 cases) asserts every (role × permission) pair, so adding a permission without updating the matrix fails CI.

**Ownership scoping** — `can()` applies AGENT ownership when an `OwnableResource` is supplied; services consistently **load the row first and pass it** (e.g. `customers.getCustomer` returns `NotFound` for a non-owned record — verified), and list/search queries inject `assignedAgentId` at the repository layer. Booking ownership flows through `customer.assignedAgentId`; payment through `booking → customer`; quotation through customer-or-lead; task through `assignedToId`.

**Server-action discipline** — all 14 modules' `*.actions.ts` use the `serverAction()` wrapper and call `requireUser()`/`requirePermission()`; every service except `auth` (which *is* auth) and `dashboard` (read-only widgets, see F2) enforces permissions. Inputs are Zod-parsed inside the action body. **Forged server-action calls** therefore still hit `requireUser` → `requirePermission` → Zod; a crafted RPC cannot bypass authorization.

**Document access** — downloads route through `/api/documents/[id]/download`: resolve session → `getDownloadUrl(user, id)` (permission + ownership + **audit**) → 302 to a freshly minted **5-minute** R2 signed URL. The bucket is private; raw keys are never exposed; filenames are sanitized; content-type allowlist (PDF/JPEG/PNG) and 25 MB cap are enforced. **Document URL sharing** is bounded to the 5-minute TTL and is never embedded in email.

**Cron** — every `/api/cron/*` route requires `Authorization: Bearer <CRON_SECRET>` and **fails closed** when the secret is unset. Sweeps are idempotent (e.g. `Task.reminderSentAt` claim; `EmailOutbox` `FOR UPDATE SKIP LOCKED`).

**PII** — Pino global redaction list + `redactPII()` (recursive) mask `passportNo` to last-4 and strip `dob`, `passportExpiry`, tokens, cookies, and `fileKey`s before logs/Sentry/AuditLog. BigInt is stringified for JSON safety.

---

## 3. F1 — Server actions swallowed Next.js control-flow [FIXED]

**File:** `lib/errors/server-action-wrapper.ts`

The `serverAction` wrapper caught **every** thrown value. Next.js implements `redirect()`, `notFound()`, and dynamic-server bail-out by *throwing* sentinel errors. The wrapper caught these, logged them as "unexpected error", reported them to Sentry, and returned a generic `ActionResult` — so:
- `requireUser()` → `redirect("/login")` inside an action **never redirected**; the caller got a generic error instead.
- `notFound()` was swallowed.
- During build, `/settings/profile` logged a spurious `DYNAMIC_SERVER_USAGE` error.

**Fix:** call `unstable_rethrow(err)` (from `next/navigation`) at the top of the catch handler so framework control-flow propagates untouched; only real errors are classified/logged.

---

## 4. F2 — Dashboard leaked agency-wide data to AGENT [FIXED]

**Files:** `app/(app)/dashboard/*.tsx`, new `app/(app)/dashboard/scope.ts`

The dashboard widgets are server components that queried the DB **directly**, bypassing the service layer, with **no `requireUser()` and no ownership scoping**. An AGENT (who must see only their own records and must not access financials) saw:
- agency-wide counts (`DashboardStats`),
- **total pipeline revenue** (`BookingStats`) and **accepted quotation value** (`QuotationStats`),
- **the 8 most recent payments across the whole agency**, with amounts and customer names (`RecentPayments`),
- all recent leads / upcoming travel / open tasks.

This is broken access control (financial data exposure) violating the role model.

**Fix:** added `dashboardScope(user)` returning per-entity Prisma `where` fragments that mirror each module's ownership model, and applied it (plus `requireUser()`) in all seven widgets. ADMIN/MANAGER/ACCOUNTANT see everything; AGENT sees only their own customers/leads/bookings/payments/quotations/tasks. Locked in by `tests/unit/dashboard-scope.test.ts`. Because `getSession` is wrapped in React `cache()`, the per-widget `requireUser()` calls share one session lookup per request.

---

## 5. F3 — Login rate-limiting / lockout [FIXED (config) + residual]

The spec called for "lockout after 5 failed logins"; the Better Auth config did not configure rate limiting explicitly.

**Fix:** enabled Better Auth rate limiting in `lib/auth/server.ts` with tightened credential rules (`/sign-in/email`: 5/min, `/forget-password`: 3/min, `/reset-password`: 5/min) on top of a 100/min default.

**Residual (see §8):** the default rate-limit store is **in-memory**, which on Vercel serverless is **per-lambda** — it slows but does not hard-stop a distributed brute force, and it is not the same as a stateful "lock the account after 5 fails". For a hard global limit, switch to DB-backed storage (`rateLimit.storage: "database"`, which requires adding Better Auth's `rateLimit` table via `npx @better-auth/cli generate` + a migration). True account lockout (counter on the user/account row) would be a small feature addition and is intentionally **not** built here.

---

## 6. F4 — AuditLog append-only depends on `crm_app` role [ACTION REQUIRED]

**File:** `prisma/migrations/20260617000000_init/migration.sql`

The append-only protection is:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM crm_app;
    GRANT INSERT, SELECT ON "AuditLog" TO crm_app;
  END IF;
END $$;
```
On a default Neon project the app connects as the **owner** role, not `crm_app`. If the `crm_app` role does not exist, the `REVOKE/GRANT` is skipped and **the application can UPDATE/DELETE audit rows** — i.e. the audit log is not actually immutable in production.

**Required before go-live (see RUNBOOK.md → "AuditLog immutability"):**
1. Create a least-privilege `crm_app` role in Neon.
2. Point `DATABASE_URL` (runtime) at `crm_app`; keep `DIRECT_DATABASE_URL` (migrations) on the owner.
3. Re-run the grant block (or `prisma migrate deploy`) so `crm_app` loses UPDATE/DELETE on `AuditLog`.
4. Verify: as `crm_app`, `UPDATE "AuditLog" ...` must raise `permission denied`.

---

## 7. Lower-severity findings

- **F5 [FIXED]** — `/reports` added to `PROTECTED_PREFIXES` in `middleware.ts` (it still had server-side `requireUser`, but the middleware list should be complete).
- **F6 (doc)** — Only ADMIN-initiated password reset exists (`users.resetPassword` + `mustChangePassword`); there is no self-service "forgot password" email flow (`sendResetPassword` is unwired). For an admin-provisioned internal tool this is a reasonable design; building the email flow is a feature and out of scope for this audit.
- **F7 (doc)** — `session.expiresIn = 7d`, `updateAge = 12h`: this is a sliding 7-day session, **not** the spec's "12h inactivity" timeout. Acceptable for an internal tool; tighten `expiresIn` if a strict inactivity window is required.
- **F8 (doc)** — `cookieCache.maxAge = 5m` means a deactivated user's session can remain valid for up to 5 minutes. To enforce instant deactivation, also delete the user's `Session` rows on deactivate (a one-line addition in `users.deactivateUser`).
- **F9 (doc)** — `authorized()` in cron routes compares the bearer with `===`. The secret is high-entropy over HTTPS so timing extraction is impractical; if desired, switch to `crypto.timingSafeEqual`.

---

## 8. Authentication hardening checklist (production)

- [ ] `BETTER_AUTH_SECRET` = fresh 48-byte random (`openssl rand -base64 48`), unique per environment.
- [ ] `useSecureCookies` is on in production (already `env.NODE_ENV === "production"`).
- [ ] Create `crm_app` role and connect runtime as it (F4).
- [ ] (Recommended) DB-backed rate-limit storage for serverless (F3).
- [ ] (Optional) Delete sessions on user deactivation (F8).
- [ ] Confirm `CRON_SECRET` is set in Vercel (Vercel Cron injects it as the bearer automatically).

---

## 9. Privilege-escalation / attack matrix (result)

| Attempt | Result |
|---------|--------|
| AGENT fetches another agent's customer by direct ID | `NotFound` (ownership check in `getCustomer`) ✅ |
| AGENT lists customers/leads | repository injects `assignedAgentId` scope ✅ |
| AGENT records a non-cash payment | `Forbidden` (service guard) ✅ |
| AGENT refunds/voids a payment | `Forbidden` (`payments:refund` not granted) ✅ |
| MANAGER modifies an ADMIN user | `Forbidden` (`users:manage` not granted) ✅ |
| ACCOUNTANT edits a lead / uploads a passport | `Forbidden` (perms not granted) ✅ |
| ACCOUNTANT opens a non-financial report | `Forbidden` (`requireFinancialOnly`) ✅ |
| Forged server-action RPC with spoofed args | still hits `requireUser → requirePermission → Zod` ✅ |
| Direct GET on a document download without session | 302 → `/login` ✅ |
| Reuse/share a document signed URL | works only within 5-minute TTL ✅ |
| Unauthenticated call to `/api/cron/*` | 401 (fails closed) ✅ |
| AGENT views the dashboard | now scoped to own records (was: agency-wide) ✅ **after F2** |

---

## 10. Incident response (summary; full steps in RUNBOOK.md)

1. **Suspected credential compromise** — deactivate the user (Settings → Users), delete their `Session` rows, rotate `BETTER_AUTH_SECRET` (invalidates all sessions), review `AuditLog` for `actorId`.
2. **Leaked secret** (`CRON_SECRET`, R2 keys, Resend key, DB URL) — rotate in Vercel + the provider, redeploy. See RUNBOOK.md → "Secret rotation".
3. **Suspected data tampering** — query `AuditLog` by `entity`/`entityId`; if F4 is not yet done, treat audit as advisory only.
4. **R2 exposure** — keys are private; signed URLs expire in 5 min. Rotate R2 credentials if leaked.
