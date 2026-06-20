# Safar CRM — Tasks

> Build order is binding. Do not jump ahead. Pair with `ARCHITECTURE.md` and `PRD.md`.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

---

## Phase 0 — Scaffolding & foundations

### 0.1 Repo hygiene
- [ ] Confirm working-tree deletions of the prior Vite skeleton; commit a clean slate.
- [ ] Add `.editorconfig`, `.nvmrc` (Node LTS pinned).
- [ ] Adopt `pnpm` (record decision in CLAUDE.md if anything else is chosen).

### 0.2 Next.js 16 project
- [ ] `pnpm create next-app` (App Router, TS strict, Turbopack, src dir, Tailwind).
- [ ] Configure ESLint + Prettier; enable TS strict + `noUncheckedIndexedAccess`.
- [ ] Add path alias `@/*` to `src/*`.
- [ ] Add Tailwind config aligned to brand tokens.
- [ ] **Acceptance:** `pnpm dev` boots; `pnpm build` succeeds.

### 0.3 shadcn/ui
- [ ] `npx shadcn@latest init` (CSS variables, neutral palette).
- [ ] Install base primitives: button, input, select, dialog, sheet, tabs, table, toast, tooltip, form, dropdown, popover, avatar, badge, card, skeleton.

### 0.4 Prisma + Neon
- [ ] Create Neon project; capture pooled + direct URLs into `.env.local`.
- [ ] `pnpm add prisma @prisma/client`; init schema.
- [ ] Add `src/lib/db/prisma.ts` (singleton, pooled).
- [ ] Add `src/lib/db/prisma-direct.ts` (non-pooled, for scripts).
- [ ] Implement Phase 1 schema (see `ARCHITECTURE.md §7` and base spec §6) with all enums, FKs, partial unique indexes for soft delete.
- [ ] `prisma migrate dev`; verify schema.
- [ ] **Acceptance:** `prisma migrate deploy` succeeds against a fresh Neon branch.

### 0.5 Better Auth
- [ ] `pnpm add better-auth`; configure with the four roles as an additional field.
- [ ] Migrate Better Auth tables into Postgres.
- [ ] Implement `src/lib/auth/session.ts` (`getCurrentUser`, `requireUser`).
- [ ] `app/api/auth/[...all]/route.ts` handler.
- [ ] Email/password sign-in; secure cookies (HttpOnly, Secure, SameSite=Lax).
- [ ] Password reset via Resend.
- [ ] **Acceptance:** lockout after 5 failed logins; 12h inactivity timeout; 7d absolute timeout; reset link single-use, 30 min TTL.

### 0.6 Permissions framework
- [ ] `src/lib/auth/permissions/permissions.ts` — Permission union type and string-literal catalog (full list).
- [ ] `policies.ts` — role → permission map, ownership checks.
- [ ] `can(user, perm, resource?)` and `requirePermission(user, perm, resource?)`.
- [ ] **Acceptance:** Matrix test asserts every (role × permission) outcome matches `ARCHITECTURE.md §6.2`. Adding a new permission requires updating the matrix or the test fails.

### 0.7 Audit logging framework
- [ ] `AuditLog` schema + DB role grants (`INSERT, SELECT` only).
- [ ] `withAudit(action, entity, before, after, fn)` helper.
- [ ] `redactPII()` utility (passport last-4, dob removed, fileKeys removed).
- [ ] **Acceptance:** Unit test confirms redaction strips/masks expected fields recursively (nested objects, arrays).

### 0.8 Logger + monitoring
- [ ] Pino setup with redaction list.
- [ ] Sentry SDK installed (server + client), source maps uploaded.
- [ ] `/api/healthz` returns 200 on DB ping.
- [ ] **Acceptance:** A test event reaches Sentry from prod env.

### 0.9 Money + numbering helpers
- [ ] `src/lib/money/paisa.ts` — `Paisa` branded `bigint`, `add/sub/mul/div`, `formatPKR`, `parsePKR`.
- [ ] Quote/invoice numbering via Postgres sequence + helper.
- [ ] Lint rule (or grep CI step) banning `number` for money fields.
- [ ] **Acceptance:** Unit tests cover overflow, division-with-rounding policy, and formatting.

### 0.10 Env validation
- [ ] `src/lib/env.ts` parses `process.env` via Zod; refuses on invalid.
- [ ] `.env.example` with all required vars.

### 0.11 Seed
- [ ] Seed script: one ADMIN user (email/password from env).
- [ ] Optional demo seed gated behind `NODE_ENV !== 'production'`.

### 0.12 Deployment baseline
- [ ] Connect repo to Vercel; configure env vars.
- [ ] `prisma migrate deploy` pre-build step.
- [ ] Preview deployment on every PR (Neon branch DB).
- [ ] **Acceptance:** A throwaway PR produces a working preview deployment with seeded ADMIN.

---

## Phase 1 — MVP modules (build in this order)

### 1.1 Users (admin)
- [ ] `users` module (actions, service, repository, schemas, permissions, ui).
- [ ] Invite flow: invite email, set-password page, activation.
- [ ] Deactivation with active-records guard (must reassign first).
- [ ] **Acceptance:** permission matrix test passes; deactivation gated by open leads.

### 1.2 Customers
- [ ] Schema + repository + service + actions + Zod schemas.
- [ ] CRUD UI: list (TanStack Table), detail, create/edit form.
- [ ] Search by name/phone/email/passport-last4.
- [ ] PII redaction confirmed in logs and audit JSON.
- [ ] Soft delete & restore (ADMIN).
- [ ] **Acceptance:** AGENT cannot fetch a non-owned customer by direct ID. Audit JSON shows passport last-4 only.

### 1.3 Customer import (CSV/XLSX)
- [ ] Streamed parser; per-row Zod validation; chunked insert with savepoints.
- [ ] `ImportRun` table; UI for status + error-report download.
- [ ] Limits: 25 MB file, 50k rows.
- [ ] **Acceptance:** A file with 100 valid + 5 malformed rows imports 100 and reports the 5 with line numbers.

### 1.4 Leads (kanban + list) & interactions
- [ ] Lead schema, service, actions, schemas.
- [ ] Kanban UI (mobile-friendly: horizontal scroll + tap-to-move at <640px) with optimistic concurrency.
- [ ] List view (TanStack Table) with the same filters.
- [ ] Lead create form optimized for mobile (≤10s entry).
- [ ] Lead-to-booking conversion (atomic: create/link Customer + Booking + interaction trail).
- [ ] Interaction module: log call/whatsapp/email/meeting/note; polymorphic FK constraint (DB check).
- [ ] `wa.me` button creates an Interaction and opens the link.
- [ ] **Acceptance:** Two concurrent stage transitions: one succeeds, one returns a conflict and refetches.

### 1.5 Tasks + cron sweeps
- [x] Task schema + service + UI (my open tasks, sorted by dueDate).
- [x] Manual create from Lead/Customer/Booking context.
- [x] Cron `sweep-reminders`: emails due tasks via Resend outbox; idempotent. _(Runs daily on the Vercel Hobby plan rather than every 15 min; claim via `reminderSentAt`.)_
- [x] Cron `sweep-passport-expiry` (daily): creates `Task(type=PASSPORT_EXPIRY)` per `Customer.passportExpiry` in window.
- [x] Cron `sweep-payment-due` (daily): tasks for unpaid bookings with travel approaching.
- [x] Email outbox + drain cron.
- [x] **Acceptance:** Running the reminder cron twice in succession produces exactly one email per due task.

### 1.6 Bookings
- [x] Schema + service + UI: create, edit, cancel.
- [x] Money via `Paisa` bigint; UI input/output in PKR.
- [x] **Acceptance:** Cancellation preserves all payment rows; `Booking.status='CANCELLED'`.

### 1.7 Payments
- [x] Schema + service + UI: record payment, refund.
- [x] Balance-due computation as derived field (no stored aggregate).
- [x] AGENT restricted to CASH on own bookings only.
- [x] **Acceptance:** Balance correct after a refund (original PAID row unchanged, REFUNDED row added).

### 1.8 Quotations + PDF
- [ ] Schema + service + UI: draft → send → accepted/expired.
- [ ] Numbering at `SENT` via Postgres sequence.
- [ ] React PDF template (uses settings.agencyProfile).
- [ ] Quotation email via Resend outbox; PDF stored in R2.
- [ ] Cron `sweep-quotation-expiry` daily 08:00 PKT.
- [ ] **Acceptance:** 50 concurrent `SEND` operations produce 50 unique sequential numbers, no duplicates.

### 1.9 Documents (basic)
- [ ] Schema + service + UI: upload (presigned PUT), list per customer/booking.
- [ ] Download route with permission check + audit + 5-min signed URL.
- [ ] SHA-256 checksum verified before recording the `Document` row.
- [ ] **Acceptance:** Unauthorized download returns 403 AND writes an audit row with the attempted access.

### 1.10 Dashboard
- [ ] KPI cards (active enquiries, conversion, revenue, upcoming travel, expiring passports).
- [ ] Recharts: monthly bookings & revenue; top destinations.
- [ ] Role-aware data scoping (AGENT sees own).

### 1.11 Settings
- [ ] Agency profile (name, address, logo, tax id) editor (ADMIN).
- [ ] Lead-source list editor.

### 1.12 Audit log viewer
- [ ] List view filtered by entity / actor / date with diff display.

### 1.13 Critical-path tests (Playwright)
- [ ] Login (success, lockout).
- [ ] Create lead → convert → booking → payment.
- [ ] AGENT cannot view another agent's customer (URL probing test).
- [ ] Quote SEND under concurrency.
- [ ] Document download permission + audit assertion.

### 1.14 Production readiness
- [ ] Sentry verified in prod (test event).
- [ ] Healthcheck monitored externally.
- [ ] Backup/restore drill executed once and documented.
- [ ] Runbook in `docs/runbook.md`.

---

## Phase 2 (sketch — refine before starting)

- Invoices: schema-complete, workflow (issue, void), accountant UI.
- Document management UI (preview, expiry tracking, type filters).
- Email templates editor (Resend).
- Supplier/vendor records.
- Richer reports: revenue by agent, top destinations, lead-source performance, average lead-to-quote and quote-to-book times.
- `record_shares` table if AGENT-to-AGENT sharing required.
- Optional: Trigger.dev if Cron insufficient.

## Phase 3 (sketch)

- WhatsApp Business API (templated messages, confirmations, reminders).
- AI itinerary + AI email writer (Anthropic Claude API; guardrails on policy/price claims).
- AI chatbot with strict guardrails.
- Customer self-service portal.
- PostHog (only if measured need).
- Redis (only if measured need).

---

## Definition of Done (every task)

A task is done only when:
1. Code adheres to the layer rules in `ARCHITECTURE.md §3`.
2. Server actions validate with Zod and authorize via `can/requirePermission`.
3. Mutations are wrapped with `withAudit`.
4. Money is `Paisa` bigint.
5. Soft-delete and ownership filters live at the repository layer.
6. PII redaction verified in any new logged/audited path.
7. Unit tests cover the service path and permission edges.
8. UI works at 360px and at 1280px+.
9. Playwright e2e exists if the task is on the critical-path list (§1.13).
10. CI green; no `console.log` introduced; no `number` for money.
