# Safar CRM — Architecture

> Authoritative design document. Read before touching code.
> Paired with: `PRD.md` (what to build), `TASKS.md` (build order), `CLAUDE.md` (working guide).

## 1. Goals

Safar CRM is an internal staff tool for a single Pakistani travel agency. It captures every enquiry, moves leads through to bookings, remembers every interaction, and never lets follow-ups or payments slip. **Security and correctness rank above velocity.** Single tenant, PKR only, mobile-first.

---

## 2. Architectural decisions and refinements

Decisions layered on top of `safar-crm-spec.md`. Any deviation must be discussed before implementation.

### 2.1 Identity & RBAC
- **Better Auth owns identity.** Its `user` table is the source of truth for credentials. The domain `role` column lives on Better Auth's user table (Better Auth supports additional fields).
- **Permissions are policy-based, not role-based at the call site.** Code calls `can(user, action, resource)`; the policy module decides based on role + ownership. Role strings appear only inside `src/lib/auth/permissions/`.
- **Ownership scoping:** `AGENT` sees records where `assignedAgentId === user.id` OR records explicitly shared via a future `record_shares` table (Phase 2). `MANAGER`/`ADMIN` see all.

### 2.2 Money
- **All money columns are `BigInt`** (Prisma `BigInt`, Postgres `BIGINT`) measured in paisa. `Int4` (~21M PKR ceiling) is too small for cumulative totals and reporting.
- A single helper module `src/lib/money/paisa.ts` exposes `add/sub/mul/div/format/parse`. Arithmetic happens nowhere else.
- A `Paisa` branded type (`type Paisa = bigint & { __brand: 'Paisa' }`) prevents accidental mixing with regular numbers.
- Display formatting is locale-explicit (lakh-crore vs Western grouping — decided in one place).

### 2.3 Numbering for Quotations and Invoices
- Quote and invoice numbers are generated from a **Postgres sequence per year per type**, formatted `SQ-2026-000123` / `INV-2026-000123`. Never derived from `MAX(...) + 1` — that races under concurrency.
- Numbers are issued at transition to `SENT` / `ISSUED`, not at draft creation, to avoid skipped numbers from abandoned drafts. Once issued they are immutable.

### 2.4 Soft delete + unique constraints
- Soft-deleted rows still occupy unique-index space. Where re-creation must be possible after soft delete, use **partial unique indexes** `WHERE "deletedAt" IS NULL`.
- All read queries default to `WHERE deletedAt IS NULL`. The repository layer enforces this; only admin-tools paths may opt-in to include soft-deleted rows via an explicit `includeDeleted: true` flag.

### 2.5 Concurrency on the lead pipeline
- Kanban drag-and-drop is multi-user. Lead stage transitions use **optimistic concurrency control**: every update includes `WHERE id = ? AND updatedAt = ?` (the value the client read). If 0 rows match, the server returns a conflict and the UI refetches.
- Lead reassignment uses the same pattern.

### 2.6 Cron idempotency
- Vercel Cron can fire twice across deploys. Every cron handler is idempotent:
  - Reminder sweeps mark `Task.reminderSentAt` and `Task.reminderEmailMessageId` before/after sending; a row with a non-null `reminderSentAt` within the cooldown window is skipped.
  - Passport-expiry sweeps create at most one open `Task` of type `PASSPORT_EXPIRY` per customer per expiry window (enforced via a partial unique index on `(customerId, type)` where `status='OPEN'`).

### 2.7 Signed URLs and emails
- File downloads always go through `/api/documents/[id]/download` which (1) checks permission, (2) audits, (3) 302-redirects to a freshly minted 5-minute R2 signed URL.
- **Never embed R2 signed URLs in emails.** Email links point to the gated download page; the recipient signs in there. Signed URLs in emails outlive their TTL, leak in mail archives, and bypass audit.

### 2.8 Passport / DOB redaction
- A central `redactPII(obj)` utility strips/masks `passportNo`, `passportExpiry`, `dob`, and document fileKeys before any value enters Pino logs, Sentry payloads, or `AuditLog.before/after`.
- `passportNo` is masked to last-4 in `AuditLog`. Full passport history (Phase 2) lives in a separate, access-logged `SensitiveAuditLog` table.

### 2.9 Audit log scope
- AuditLog covers **every mutation** routed through services, not only Bookings/Payments. The base spec calls Bookings/Payments "at minimum" — broader coverage is cheap if centralised in a base service helper. Schema: `entity`, `entityId`, `before`, `after`, `action`, `actorId`, `createdAt`, plus `ip` and `userAgent` for forensics.
- AuditLog is **append-only at the DB role level**. The application role has `INSERT, SELECT` on `audit_log`; no `UPDATE, DELETE`.

### 2.10 Phone normalization
- All phone fields stored E.164 (`+923001234567`). A helper validates and normalizes on input; raw input is dropped. WhatsApp deep links use the E.164 value with `+` stripped.

### 2.11 Time zone
- Storage: UTC. Display: `Asia/Karachi` (PKT) by default.
- `Task.dueDate` is interpreted as PKT midnight unless explicitly time-bound. A helper `pktStartOfDay(date)` is the only converter; nothing else calls `Intl.DateTimeFormat` directly.

### 2.12 CSV/Excel import
- Streamed parse (`papaparse` for CSV, `exceljs` for XLSX), per-row Zod validation, batched insert (chunks of 200) inside a transaction with savepoints — a bad row reports its line number without aborting the whole import.
- Imports above 5,000 rows go through a background-friendly route invoked once; the user sees an `ImportRun` row in the UI.
- Every import produces an `ImportRun` record with per-row outcomes downloadable as CSV.

### 2.13 Rate limiting
- Login, forgot-password and CSV-import endpoints are rate-limited per IP and per identifier. v1: Postgres-backed counter (good enough single-region). Redis arrives in Phase 2 only if measured need.

### 2.14 WhatsApp interaction logging
- `wa.me` is client-side; the server never sees the message. When the user clicks "WhatsApp" we (a) create an `Interaction(type=WHATSAPP, body='[click-to-chat opened]', occurredAt=now)` via server action, then (b) open `wa.me`. The body is editable inline afterwards so the agent can paste a summary.

### 2.15 Transactional email outbox
- Email sends are written as `EmailOutbox(status=PENDING, payload)` rows **in the same transaction** as the change that triggers them. A 1-minute cron drains pending rows. This eliminates the "email succeeded but DB rolled back" and "DB committed but email never sent" failure modes.
- Bounce/complaint webhooks update `EmailOutbox.status`.

### 2.16 UserContext-pure services
- Services accept a `UserContext` (id, role, ip, userAgent) as their first argument and never read `cookies()` / `headers()` directly. This makes services testable without a request.
- Server actions own the boundary: read session → assemble `UserContext` → call service.

---

## 3. Layered architecture

```
┌──────────────────────────────┐
│       UI / React (RSC)       │  src/app/, src/modules/<mod>/ui/, src/ui/
├──────────────────────────────┤
│        Server Actions        │  src/modules/<mod>/actions.ts
│  (Zod validate → authorize → │
│      delegate to service)    │
├──────────────────────────────┤
│           Services           │  src/modules/<mod>/service.ts
│   (business logic, no I/O    │
│        beyond repos)         │
├──────────────────────────────┤
│         Repositories         │  src/modules/<mod>/repository.ts
│   (Prisma calls only — no    │
│     business decisions)      │
├──────────────────────────────┤
│            Prisma            │  src/lib/db/prisma.ts (singleton)
├──────────────────────────────┤
│          PostgreSQL          │  Neon, pooled
└──────────────────────────────┘
```

### Hard rules
1. UI never imports `@prisma/client` or any `repository.ts`. UI calls only **server actions**.
2. **Server actions** do five things in order: parse with Zod → load session → `can(...)` check → call service → return narrow DTO (`ActionResult<T>`).
3. **Services** never read `cookies()` / `headers()`, never throw HTTP errors. They take a `UserContext`. They orchestrate repos + side effects (email, PDF, R2, audit).
4. **Repositories** are pure data access. No business decisions, no audit calls, no email. One repository file per aggregate root.
5. The Prisma client is a single shared singleton with the **pooled** Neon connection. A second non-pooled client exists only for migrations and admin scripts.
6. Any cross-module call goes service → service. Never UI → service of another module, never repo → repo of another module.

### Cross-cutting helpers
- `withTransaction(fn)` — wraps a service body in `prisma.$transaction`, accepting nested-callable services.
- `withAudit(action, entity, before, after, fn)` — runs `fn` then writes an `AuditLog` row inside the same transaction.
- `requirePermission(user, perm)` / `can(user, perm, resource)` — throws `ForbiddenError` if not allowed; `resource` carries `assignedAgentId` for ownership checks.

---

## 4. Folder structure

```
/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                        # one ADMIN, optional demo data
├── src/
│   ├── app/                           # Next.js App Router — thin
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx             # session-gated shell, nav
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── customers/{page,[id]/page,import/page}.tsx
│   │   │   ├── leads/{page (kanban),list/page,[id]/page}.tsx
│   │   │   ├── bookings/...
│   │   │   ├── payments/...
│   │   │   ├── quotations/...
│   │   │   ├── tasks/page.tsx
│   │   │   ├── users/...              # admin only
│   │   │   ├── audit/page.tsx
│   │   │   └── settings/...
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts # Better Auth handler
│   │   │   ├── documents/[id]/download/route.ts
│   │   │   ├── cron/
│   │   │   │   ├── sweep-reminders/route.ts
│   │   │   │   ├── sweep-passport-expiry/route.ts
│   │   │   │   ├── sweep-payment-due/route.ts
│   │   │   │   ├── sweep-quotation-expiry/route.ts
│   │   │   │   └── drain-email-outbox/route.ts
│   │   │   └── healthz/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── modules/                       # one folder per bounded context
│   │   ├── auth/
│   │   ├── users/
│   │   ├── customers/
│   │   │   ├── actions.ts
│   │   │   ├── service.ts
│   │   │   ├── repository.ts
│   │   │   ├── schemas.ts             # Zod input + output types
│   │   │   ├── permissions.ts         # policies for customer actions
│   │   │   ├── importer.ts            # CSV/XLSX
│   │   │   └── ui/
│   │   ├── leads/
│   │   ├── interactions/
│   │   ├── tasks/
│   │   ├── bookings/
│   │   ├── payments/
│   │   ├── quotations/
│   │   ├── invoices/
│   │   ├── documents/
│   │   ├── dashboard/
│   │   ├── audit/
│   │   └── settings/
│   ├── lib/                           # cross-cutting infrastructure
│   │   ├── auth/
│   │   │   ├── server.ts              # Better Auth config
│   │   │   ├── client.ts
│   │   │   ├── session.ts             # getCurrentUser, requireUser
│   │   │   └── permissions/
│   │   │       ├── can.ts
│   │   │       ├── policies.ts
│   │   │       ├── permissions.ts     # the permission enum
│   │   │       └── types.ts
│   │   ├── db/
│   │   │   ├── prisma.ts              # pooled singleton
│   │   │   ├── prisma-direct.ts       # non-pooled for scripts
│   │   │   └── transaction.ts         # withTransaction helper
│   │   ├── audit/
│   │   │   ├── log.ts                 # writeAuditLog, withAudit
│   │   │   └── redact.ts              # redactPII()
│   │   ├── errors/
│   │   │   ├── app-error.ts           # AppError hierarchy
│   │   │   ├── codes.ts
│   │   │   └── handle.ts              # toActionResult mapping
│   │   ├── logger/pino.ts             # Pino with PII redaction list
│   │   ├── money/{paisa.ts,format.ts}
│   │   ├── phone/normalize.ts
│   │   ├── storage/
│   │   │   ├── r2.ts
│   │   │   └── signed-url.ts
│   │   ├── email/
│   │   │   ├── client.ts              # Resend
│   │   │   ├── outbox.ts              # enqueue, drain
│   │   │   └── templates/
│   │   ├── pdf/render.ts
│   │   ├── numbering/sequence.ts
│   │   ├── time/tz.ts
│   │   ├── monitoring/sentry.ts
│   │   ├── env.ts                     # Zod-parsed process.env
│   │   └── validation/zod.ts
│   ├── ui/
│   │   ├── components/                # shared higher-level components
│   │   │   ├── data-table/
│   │   │   ├── kanban/
│   │   │   ├── form/
│   │   │   └── empty-state/
│   │   └── primitives/                # shadcn-generated
│   └── types/                         # ambient + shared types
├── tests/
│   ├── unit/                          # services & helpers
│   ├── integration/                   # repository + DB
│   └── e2e/                           # Playwright critical paths
├── scripts/
│   ├── seed-demo.ts
│   └── backfill-*.ts
├── .env.example
├── ARCHITECTURE.md
├── PRD.md
├── TASKS.md
└── CLAUDE.md
```

### Module rules
- A module folder is a **boundary**. Other modules import only from a module's `service.ts` exports — not from its repository or schemas.
- A module's `ui/` may import other modules' `ui/` only via shared `src/ui/`. Module UI must not import another module's `service.ts` either; cross-module reads go through the consumer module's own service.

---

## 5. Module catalog

For each module: scope, key entities, key actions, permissions, dependencies.

### 5.1 auth
- **Scope:** sessions, login, forgot/reset password.
- **Owns:** Better Auth tables, session helpers, `requireUser`.
- **Out of scope:** authorization decisions (that's `lib/auth/permissions`).

### 5.2 users
- **Scope:** user CRUD, role assignment, activation.
- **Entities:** `User`.
- **Permissions:** `users.read`, `users.write`, `users.deactivate`. ADMIN only.
- **Notes:** Soft-delete = deactivate. Hard-delete forbidden by policy. Deactivation blocked while user owns open Leads — prompt to reassign first.

### 5.3 customers
- **Scope:** customer master record.
- **Entities:** `Customer`.
- **Key actions:** create, update, list (paginated, filterable), import CSV/XLSX, soft-delete, restore (ADMIN).
- **Permissions:** `customers.read` (ownership-scoped for AGENT), `customers.write`, `customers.import`, `customers.delete`.
- **PII:** `passportNo`, `passportExpiry`, `dob` redacted in logs/audit per §2.8.

### 5.4 leads
- **Scope:** enquiry pipeline.
- **Entities:** `Lead`.
- **Key actions:** create, advance/regress stage, assign agent, convert to BOOKED (creates/links Customer + Booking atomically).
- **Permissions:** `leads.read` (ownership-scoped), `leads.write`, `leads.assign` (MANAGER+), `leads.convert`.
- **UI:** kanban + list.
- **Concurrency:** optimistic via `updatedAt`.

### 5.5 interactions
- **Scope:** log of every touchpoint.
- **Entities:** `Interaction`.
- **Notes:** polymorphic to Lead or Customer via nullable FKs; exactly one must be set (DB check constraint).

### 5.6 tasks
- **Scope:** follow-ups, reminders.
- **Entities:** `Task`.
- **Triggers:** created manually, by lead stage transitions, by passport-expiry sweep, by payment-due sweep.
- **Cron:** `sweep-reminders` sends email reminders via Resend (outbox).

### 5.7 bookings
- **Scope:** confirmed trips.
- **Entities:** `Booking`.
- **Triggered by:** lead conversion or direct creation.
- **Permissions:** `bookings.read` (ownership), `bookings.write`, `bookings.cancel` (MANAGER+).

### 5.8 payments
- **Scope:** manual recording, balance-due computation.
- **Entities:** `Payment`.
- **Permissions:** `payments.read`, `payments.write` (ACCOUNTANT/ADMIN; AGENT may record CASH receipts on own bookings only).
- **Notes:** No payment gateway in v1. Balance-due = `totalPricePaisa - SUM(payment.amountPaisa)` for non-refunded payments.

### 5.9 quotations
- **Scope:** quote drafts, sending, PDF.
- **Entities:** `Quotation`.
- **Numbering:** `SQ-YYYY-NNNNNN`, assigned on `SENT`.
- **PDF:** React PDF rendered server-side, stored in R2 if attached to email.

### 5.10 invoices
- **Scope:** Phase 2.
- v1 scaffolding: schema only, no UI.

### 5.11 documents
- **Scope:** file uploads tied to customer/booking; expiry tracking.
- **Entities:** `Document`.
- **Download:** `/api/documents/[id]/download` (gated, audited, 5-min signed URL).
- **Upload:** server issues presigned PUT URLs constrained on content-type and size.

### 5.12 dashboard
- **Scope:** counts + charts. Read-only.
- **Data scoping:** AGENT sees own; MANAGER/ADMIN/ACCOUNTANT see all.

### 5.13 audit
- **Scope:** read-only viewer of `AuditLog` (ADMIN, MANAGER).

### 5.14 settings
- **Scope:** agency profile (name, logo, address, tax id) used in PDFs; lead-source list.
- ADMIN only.

---

## 6. RBAC design

### 6.1 Permission catalog
Single source of truth: `src/lib/auth/permissions/permissions.ts`.

```
customers.read
customers.write
customers.import
customers.delete

leads.read
leads.write
leads.assign
leads.convert

interactions.read
interactions.write

tasks.read
tasks.write
tasks.assign

bookings.read
bookings.write
bookings.cancel

payments.read
payments.write
payments.refund

quotations.read
quotations.write
quotations.send

invoices.read
invoices.write
invoices.void

documents.read
documents.upload
documents.delete

users.read
users.write
users.deactivate

settings.read
settings.write

reports.financial
reports.operational

audit.read
```

### 6.2 Role-to-permission matrix (v1)

|                        | ADMIN | MANAGER | AGENT       | ACCOUNTANT |
|------------------------|:-----:|:-------:|:-----------:|:----------:|
| customers.read         |   ✓   |   ✓     |   own*      |    ✓ (ro)  |
| customers.write        |   ✓   |   ✓     |   own*      |     —      |
| customers.import       |   ✓   |   ✓     |     —       |     —      |
| customers.delete       |   ✓   |   ✓     |     —       |     —      |
| leads.read             |   ✓   |   ✓     |   own*      |     —      |
| leads.write            |   ✓   |   ✓     |   own*      |     —      |
| leads.assign           |   ✓   |   ✓     |     —       |     —      |
| leads.convert          |   ✓   |   ✓     |   own*      |     —      |
| interactions.*         |   ✓   |   ✓     |   own*      |    read    |
| tasks.read             |   ✓   |   ✓     |   own*      |    own*    |
| tasks.write            |   ✓   |   ✓     |   own*      |    own*    |
| tasks.assign           |   ✓   |   ✓     |     —       |     —      |
| bookings.read          |   ✓   |   ✓     |   own*      |    ✓ (ro)  |
| bookings.write         |   ✓   |   ✓     |   own*      |     —      |
| bookings.cancel        |   ✓   |   ✓     |     —       |     —      |
| payments.read          |   ✓   |   ✓     |   own*      |     ✓      |
| payments.write         |   ✓   |   ✓     |  own cash†  |     ✓      |
| payments.refund        |   ✓   |   ✓     |     —       |     ✓      |
| quotations.*           |   ✓   |   ✓     |   own*      |    ✓ (ro)  |
| invoices.*             |   ✓   |   ✓     |     —       |     ✓      |
| documents.read         |   ✓   |   ✓     |   own*      |    ✓ (ro)  |
| documents.upload       |   ✓   |   ✓     |   own*      |     —      |
| documents.delete       |   ✓   |   ✓     |     —       |     —      |
| users.*                |   ✓   |   —     |     —       |     —      |
| settings.*             |   ✓   |   —     |     —       |     —      |
| reports.financial      |   ✓   |   ✓     |     —       |     ✓      |
| reports.operational    |   ✓   |   ✓     |   own*      |     —      |
| audit.read             |   ✓   |   ✓     |     —       |     —      |

\* "own" means records where `assignedAgentId === user.id`.
† AGENT may record CASH receipts only on own bookings; BANK_TRANSFER, CARD, OTHER require ACCOUNTANT or ADMIN.

### 6.3 API

```ts
type Permission = "customers.read" | "customers.write" | ...;

interface UserContext { id: string; role: Role; ip?: string; userAgent?: string; }

interface OwnableResource { assignedAgentId?: string | null; }

function can(user: UserContext, perm: Permission, resource?: OwnableResource): boolean;
function requirePermission(user: UserContext, perm: Permission, resource?: OwnableResource): void; // throws ForbiddenError
```

The policy module decides; call sites only express intent. A matrix unit test asserts every (role × permission) outcome matches §6.2.

---

## 7. Data layer

- **Prisma client:** singleton in `src/lib/db/prisma.ts`. Uses Neon **pooled** connection in `DATABASE_URL`. A separate `DIRECT_DATABASE_URL` (non-pooled) is used for `prisma migrate` only.
- **Transactions:** Every multi-statement write goes through `withTransaction`. Audit entries are written in the same transaction as the change.
- **Soft delete:** Repositories expose `findX`/`listX` that filter `deletedAt IS NULL`; an `includeDeleted: true` opt-in exists for admin tools.
- **Indexes:**
  - Every foreign key.
  - Partial unique indexes for soft-deleted uniqueness (e.g., `Customer.email WHERE deletedAt IS NULL`).
  - `(entity, entityId)` on `AuditLog`; `(actorId, createdAt)` on `AuditLog`.
  - `(assignedToId, status, dueDate)` on `Task`.
  - `(assignedAgentId, status)` on `Lead`.
  - `(customerId, status)` on `Booking`.
  - Partial unique on `Task(customerId, type) WHERE status='OPEN'` for passport-expiry idempotency.
- **Enums:** Postgres native enums via Prisma `enum` blocks for every status.
- **Backups:** Neon PITR. RPO ≤ 1 hour; RTO ≤ 4 hours. Documented in runbook.

### Schema additions beyond base spec
- `Quotation.issuedAt`, `Quotation.sentAt`, `Quotation.pdfFileKey`.
- `Task.reminderSentAt`, `Task.reminderEmailMessageId`, `Task.reminderCount`.
- `Document.checksumSha256`, `Document.contentType`, `Document.sizeBytes`.
- `AuditLog.ip`, `AuditLog.userAgent`.
- `ImportRun(id, type, status, totalRows, okRows, errorRows, startedAt, finishedAt, byUserId, errorReportFileKey)`.
- `EmailOutbox(id, to, subject, templateKey, payload, status, providerMessageId, error, attempts, scheduledAt, sentAt)`.
- `Sequence(name PK, currentValue)` (or Postgres native sequences) for numbering.

---

## 8. File storage & signed URLs

- One private R2 bucket per environment (`safar-crm-prod-docs`, `safar-crm-dev-docs`). No public read.
- Object keys are content-addressed: `documents/{customerId}/{uuid}/{filename}`.
- Uploads use **server-issued presigned PUT URLs** with content-type and max-size constraints. The server records the `Document` row only after a HEAD confirms the object exists and matches expected size/checksum.
- Downloads route through `/api/documents/[id]/download`:
  1. resolve session,
  2. `requirePermission(user, 'documents.read', doc)`,
  3. write audit,
  4. mint 5-minute signed GET URL,
  5. 302 redirect.
- Email links **never** carry the signed URL; they link to the same gated route.
- Allowed content types: `application/pdf`, `image/jpeg`, `image/png`. Max size 25 MB per file.

---

## 9. Background jobs (Vercel Cron)

| Cron job                      | Schedule (PKT)   | Idempotency mechanism                                          |
|-------------------------------|------------------|----------------------------------------------------------------|
| sweep-reminders               | every 15 min     | `Task.reminderSentAt` + cooldown window                        |
| sweep-passport-expiry         | daily 06:00      | partial unique index on `(customerId,type)` where status=OPEN  |
| sweep-payment-due             | daily 07:00      | `Task` linked to `bookingId` with same constraint              |
| sweep-quotation-expiry        | daily 08:00      | flips `Quotation.status = EXPIRED` past `validTill`            |
| drain-email-outbox            | every 1 min      | row-level lock on `EmailOutbox(status=PENDING)`                |

Each handler requires a `CRON_SECRET` header; non-matching requests return 401.

---

## 10. Email (Resend)

- Templates rendered with React Email; the same renderer feeds Resend.
- **Transactional outbox:** write `EmailOutbox(status='PENDING', payload)` in the same transaction as the trigger; cron drains pending rows.
- Bounce/complaint webhook updates `EmailOutbox.status` and surfaces failures to ADMIN.

---

## 11. PDF (React PDF)

- Rendered server-side. Quotations and invoices both share a layout component reading agency profile from `settings`.
- Generated PDFs are stored in R2 and linked from the entity (`Quotation.pdfFileKey`).
- Print-CSS path remains as a fallback for ad-hoc views.

---

## 12. Audit logging

- `AuditLog` rows written for every mutation via `withAudit(action, entity, before, after, fn)`.
- `before`/`after` are JSON snapshots after `redactPII(...)`. Passport numbers reduced to last-4; DOB removed; file keys removed.
- Append-only at the DB role level: `crm_app` has `INSERT, SELECT` on `audit_log`; no `UPDATE, DELETE`.
- `before/after` are diffed to changed fields plus the identity key, to cap row size.
- Viewer module renders changes with diff highlighting.

---

## 13. Error handling

- `AppError` base class with subclasses: `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `IntegrationError`, `UnexpectedError`.
- Services throw typed errors. Server actions map them via `handle(err)` to a discriminated union return:
  ```ts
  type ActionResult<T> =
    | { ok: true; data: T }
    | { ok: false; code: ErrorCode; message: string; field?: string };
  ```
- Server actions never throw to the client; they always return `ActionResult`.
- Sentry receives unexpected errors with PII redacted; expected errors (validation, forbidden, conflict) are not reported.
- Toast/inline error mapping happens in a single client helper.

---

## 14. Logging

- Pino in JSON mode. Levels: `trace, debug, info, warn, error, fatal`.
- A standard redaction list at the Pino config level: `passportNo`, `dob`, `passportExpiry`, `body` (interaction body — redact in info, allow at debug only behind an env flag), `fileKey`, `signedUrl`, `password`, `*.cookie`, `authorization`.
- Each request gets a `requestId`; included in every log line.
- In dev: pretty printer. In prod: JSON to stdout, scraped by Vercel.

---

## 15. Configuration & secrets

- All env vars parsed through Zod in `src/lib/env.ts`. App refuses to boot on invalid env.
- Secrets only via Vercel project env. `.env.example` documents required keys.
- Required vars:
  ```
  DATABASE_URL                 # Neon pooled
  DIRECT_DATABASE_URL          # Neon direct (migrations)
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET_DOCUMENTS
  R2_PUBLIC_HOST
  RESEND_API_KEY
  EMAIL_FROM
  CRON_SECRET
  SENTRY_DSN
  LOG_LEVEL
  NODE_ENV
  ```

---

## 16. Observability

- Sentry for errors (server + client) with `tracesSampleRate=0.1` initially.
- `/api/healthz` returns 200 if DB reachable; monitored externally.
- Structured Pino logs in Vercel for ad-hoc querying.
- Custom event: `audit.write_failed` paged on.

---

## 17. Testing strategy

| Layer              | Tool       | What it covers                                                       |
|--------------------|------------|----------------------------------------------------------------------|
| Unit               | Vitest     | money/paisa, phone normalize, numbering, redactPII, `can()` policies |
| Services           | Vitest     | Service logic with repositories mocked, all permission branches      |
| Repositories       | Vitest     | Real Postgres (Neon branch or local) inside transaction-rollback     |
| Server Actions     | Vitest     | Action returns `ActionResult`, including error mapping               |
| E2E                | Playwright | Critical paths: login, create lead, convert lead→booking, record payment, role-based access rejection |
| Permission matrix  | Vitest     | Every (role × permission × resource ownership) snapshotted vs §6.2   |

Test data: a `tests/factories/` directory builds entities. Tests never write to the dev DB; they use ephemeral Neon branches or a local Postgres in CI.

---

## 18. Deployment

- Vercel (production + preview). Each PR gets a preview with a Neon branch DB.
- DB migrations: `prisma migrate deploy` runs as a pre-build step on Vercel using `DIRECT_DATABASE_URL`.
- R2 buckets per environment. Resend domain configured for prod only; preview uses sandbox.
- Sentry release set to commit SHA.

---

## 19. Risks & edge cases

| Risk                                                                | Mitigation                                                                       |
|---------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Float used for money anywhere                                       | Lint rule banning `number` for money fields; `Paisa` branded `bigint` only       |
| Middleware-only auth bypass                                         | Permissions enforced inside services; middleware does session refresh only       |
| Quote/invoice number collision                                      | Postgres sequence, never `MAX(...) + 1`                                          |
| Cron double-fire                                                    | All cron handlers idempotent (§2.6)                                              |
| Soft-delete + unique email re-import                                | Partial unique indexes WHERE `deletedAt IS NULL`                                 |
| Kanban concurrent drag                                              | Optimistic concurrency on `updatedAt`                                            |
| Passport number leaking into logs/audit                             | Pino redaction + `redactPII()` in audit writer + lint rule on `console.log`      |
| Signed URL outliving its TTL in inboxes                             | Emails link to gated download, not direct R2 URL                                 |
| Email succeeds but DB transaction rolls back                        | Transactional outbox                                                             |
| CSV import partial failure aborts everything                        | Row-by-row Zod with savepoint per chunk; downloadable error report               |
| Agent left with stale leads after deactivation                      | On deactivate: prompt MANAGER to reassign; block deactivation if active leads    |
| Reporting numbers diverge between dashboards and tables             | All reports go through a single set of service methods                           |
| Time-zone bugs around midnight cron                                 | Single `pktStartOfDay()` helper; cron times documented in PKT                    |
| Large `before/after` audit JSON                                     | Snapshot only changed fields + identity key; cap JSON size                       |
| AGENT enumerating IDs to read others' customers                     | Authorization at service layer with ownership check, not URL-based               |
| Better Auth misconfigured (insecure session cookie in prod)         | Env-validated config with explicit secure cookie flag                            |
| Phone duplicates with different formatting                          | Normalize to E.164 before write                                                  |
| WhatsApp interaction body untracked                                 | Inline edit prompt after `wa.me` open to capture summary                         |
| Demo data leaking into prod                                         | Seed scripts gated by `NODE_ENV !== 'production'`                                |
| AuditLog tampering                                                  | DB role grants `INSERT, SELECT` only on `audit_log`                              |
| Document checksum mismatch (upload corruption)                      | HEAD + SHA-256 verification before recording `Document` row                      |
| Excessive Sentry noise from expected errors                         | Only `UnexpectedError` reported; others filtered                                 |

---

## 20. Open architectural questions for stakeholders

1. **Numbering compliance:** Do quote and invoice numbers need to be strictly contiguous (accounting compliance), or is "monotonic with gaps allowed" acceptable? Affects whether numbers can be issued at draft creation or only at SENT/ISSUED.
2. **Lead sharing:** Should AGENTs ever see other AGENTs' customers (shared bookings, group enquiries)? If yes, we need a `record_shares` table earlier than Phase 2.
3. **Column-level encryption:** Is there a regulatory requirement to encrypt `passportNo` at the column level (pgcrypto), or is at-rest disk encryption + role-based access sufficient?
4. **Currency display:** Lakh-crore grouping (`Rs 1,23,456`) or Western grouping (`Rs 123,456`)?
5. **SMS fallback:** Is SMS required as a fallback for email reminders in v1?
6. **PDF agency profile editing:** ADMIN unilateral, or four-eyes approval?
7. **Manager visibility limit:** Are there branches/sub-units that should partition MANAGER visibility? (Affects whether `branchId` belongs on User/Lead/Booking in v1.)
