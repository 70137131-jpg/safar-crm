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
- [x] `users` module (actions, service, repository, schemas, permissions, ui).
- [~] Onboarding: admin-create with temporary password (`mustChangePassword`) + public self-registration pending admin approval. _(Deviation from the original "email invite + set-password page": no invite-token/email flow was built — a temp-password + admin-approval model is used instead. Decide whether to keep this or add email invites.)_
- [x] Deactivation with active-records guard — blocked while the user owns open (non-terminal) leads; admin must reassign first. Enforced in both `deactivateUser` and `updateUser` (going inactive).
- [x] **Acceptance:** permission matrix test passes (`tests/unit/permissions.test.ts`); deactivation gated by open leads (`tests/unit/users.deactivation.test.ts`).

### 1.2 Customers
- [x] Schema + repository + service + actions + Zod schemas.
- [x] CRUD UI: list (TanStack Table), detail, create/edit form.
- [x] Search by name/phone/email/passport-last4 (`customers.repository.search` — passport matched by `endsWith`).
- [x] PII redaction confirmed in logs and audit JSON (`redactPII` masks `passportNo` to last-4; strips `dob`/`passportExpiry`/file keys).
- [x] Soft delete & restore (ADMIN) — `deletedAt` filtered at the repository; restore re-checks email/phone collisions.
- [x] **Acceptance:** AGENT cannot fetch a non-owned customer by direct ID (`getCustomer` → NotFound; covered in `tests/unit/customers.service.test.ts`). Audit JSON shows passport last-4 only.

### 1.3 Customer import (CSV/XLSX)
- [x] CSV parser (`papaparse`); per-row Zod validation (in the action); chunked insert (200) with a **SAVEPOINT per row** so one bad row rolls back alone (`tests/unit/customers.service.test.ts`).
- [~] `ImportRun` table; UI for status + error-report download. _(Error-report **download** done — rejected rows export to CSV in the result step. The persistent `ImportRun` history table is **not** built — it needs a Prisma/Neon migration; pending go-ahead.)_
- [x] Limits: 25 MB file, 50k rows — enforced client-side and server-side (`MAX_IMPORT_ROWS`).
- [~] XLSX import — **not** built (needs the `exceljs` dependency); CSV only for now, XLSX uploads are rejected with a clear message.
- [x] **Acceptance:** A file with 100 valid + 5 malformed rows imports 100 and reports the 5 with line numbers (malformed rows fail Zod in the action and are reported with their row number).

### 1.4 Leads (kanban + list) & interactions
- [x] Lead schema, service, actions, schemas (travel-domain `LeadStatus`, OCC via `version`, audited).
- [x] Kanban UI (mobile-friendly: horizontal scroll + tap-to-move at <640px) with optimistic concurrency. Added: optimistic drag-and-drop with rollback on failure + per-column lead count and total pipeline value.
- [x] List view with the same filters — stage / source / assigned-agent filters, sortable columns (created / travel date / budget), URL-synced filters, server-side pagination, bulk selection + bulk delete. _(Hand-built table extended in place rather than rewritten to TanStack like the customers/users lists — same filters/sort/pagination semantics.)_
- [x] Lead create form optimized for mobile (≤10s entry).
- [x] Lead-to-booking conversion (atomic: create/link Customer + Booking + interaction trail).
- [x] Interaction module: log call/whatsapp/email/meeting/note; polymorphic FK constraint (DB check).
- [x] `wa.me` button creates an Interaction and opens the link (`LeadCard`).
- [x] **Acceptance:** Two concurrent stage transitions: one succeeds, one returns a conflict and refetches — service raises `ConflictError` on a stale `version` (`tests/unit/leads.service.test.ts` "raises ConflictError on a stale version (OCC)"); the UI refetches on `CONFLICT` (kanban rolls back the optimistic move, list/kanban refetch).
- [~] _Not built:_ lead-source list comes from free text (the Settings → lead-source editor is §1.11); bulk selection is desktop-only; interaction timeline is not yet paginated.

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
- [x] Schema + service + UI: draft → send → accepted/expired.
- [x] Numbering at `SENT` via Postgres sequence.
- [x] React PDF template (uses settings.agencyProfile).
- [x] Quotation email via Resend outbox; PDF stored in R2.
- [x] Cron `sweep-quotation-expiry` (daily on the Vercel Hobby plan).
- [x] **Acceptance:** 50 concurrent `SEND` operations produce 50 unique sequential numbers, no duplicates.

### 1.9 Documents (basic)
- [x] Schema + service + UI: upload (presigned PUT), list per customer/booking. `DocumentsPanel` is mounted on the customer detail "Documents" tab; it accepts `bookingId` for the booking detail page too.
- [x] Download route with permission check + audit + 5-min signed URL (`app/api/documents/[id]/download/route.ts` → service `getDownloadUrl`).
- [x] SHA-256 checksum verified before recording the `Document` row — the presigned PUT is now signed with `x-amz-checksum-sha256`, so **R2 rejects the upload unless the bytes hash to the declared value**; the row is only recorded after the object lands. _(Deploy note: the R2 bucket CORS `AllowedHeaders` must include `x-amz-checksum-sha256` — see `modules/documents/README.md`. Cannot be verified against live R2 from here.)_
- [x] **Acceptance:** Unauthorized download returns 403 AND writes an audit row with the attempted access (`document.download.denied`) — covered by `tests/unit/documents.service.test.ts` and `tests/e2e/documents.spec.ts`.

### 1.10 Dashboard
- [x] KPI cards (active enquiries, conversion, revenue, upcoming travel, expiring passports) — `app/(app)/dashboard/DashboardStats.tsx`. Window definitions mirror the reports overview (active = not BOOKED/TRAVELLED/LOST; conversion = (BOOKED+TRAVELLED)/all leads; revenue = positive PAID payments; upcoming travel = CONFIRMED/TICKETED within 30 days; expiring passports = within 180 days).
- [x] Recharts: monthly bookings & revenue (`MonthlyTrends.tsx` → `ComposedChart`, last 6 months); top destinations by booking revenue (`TopDestinations.tsx` → horizontal bar, last 12 months, destination read via `booking.lead.destination`). Chart primitives are client components in `DashboardCharts.tsx`; money crosses the boundary pre-converted to PKR numbers (never BigInt).
- [x] Role-aware data scoping (AGENT sees own) — every widget query applies `dashboardScope(user)` (`app/(app)/dashboard/scope.ts`); covered by `tests/unit/dashboard-scope.test.ts`. Dashboard module services remain intentional stubs (read-only, queries `db` directly per `ARCHITECTURE.md §5.12`).

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
