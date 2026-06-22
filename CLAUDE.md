# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Phase 0 (scaffold) and most of Phase 1 are built. The 14 modules under `modules/` (users, customers, leads, interactions, tasks, bookings, payments, quotations, documents, + dashboard/settings/reports/invoices stubs) are present with services, repositories, actions, schemas, and unit tests; Prisma schema + migrations and Better Auth are wired. `TASKS.md` is the live checklist — the still-open Phase 1 work is **Dashboard (1.10), Settings (1.11), Audit-log viewer (1.12), critical-path Playwright (1.13), production readiness (1.14)**, plus a few `[~]` decisions (email-invite onboarding, `ImportRun` history table, XLSX import). Note: every Phase 0 checkbox in `TASKS.md` still reads `[ ]` despite being done — those boxes are stale, not real work.

## Source of truth (read in this order)

1. `ARCHITECTURE.md` — design and decisions; **binding**.
2. `PRD.md` — what to build and why.
3. `TASKS.md` — phased build order; do not jump ahead.
4. `safar-crm-spec.md` — original product spec (background context).

This file (`CLAUDE.md`) is the day-to-day operating guide. Anything that contradicts `ARCHITECTURE.md` belongs there, not here.

## What this is

Safar CRM — internal staff tool for a single Pakistani travel agency. Captures enquiries, moves leads to bookings, tracks every interaction, surfaces follow-ups and payments. No public customer portal in v1. Single tenant, PKR only, mobile-first.

## Non-negotiable rules

- **Money is `bigint` paisa.** Never `number` / float. Use `lib/money/paisa.ts`. (See `ARCHITECTURE.md §2.2`.)
- **Soft delete only** on Customers, Leads, Bookings (`deletedAt`). Reads filter `deletedAt IS NULL` at the repository layer; only an explicit `includeDeleted: true` flag bypasses it.
- **Authorization inside services, not middleware.** Call `requirePermission(user, perm)` or `can(user, perm, resource)`. Middleware does session refresh only — never access control.
- **Zod validates every server action input.**
- **PII (`passportNo`, `passportExpiry`, `dob`, file keys)** never appears in logs, Sentry payloads, or `AuditLog.before/after`. Pino's redaction list and `redactPII()` enforce this. Passport masked to last-4 in audit JSON.
- **AuditLog every mutation.** Wrap services with `withAudit(...)` inside the same transaction. AuditLog is append-only at the DB role level.
- **Signed URLs are 5-min, route-mediated, never embedded in emails.** Emails link to gated download pages.
- **Optimistic concurrency** via an integer `version` column on Customer / Lead / Booking / Quotation; a stale `version` raises `ConflictError`. (Lead stage transitions are the canonical case.)
- **Cron handlers are idempotent.** Reminder/expiry sweeps protect against Vercel Cron double-fire.
- **Mobile-first.** Tables collapse to cards under 640px. Kanban is usable at 360px.
- **Emails sent via transactional outbox** — never directly from a service body.

## Stack (locked choices)

Next.js 16 (App Router, TS strict, Turbopack) · Tailwind + shadcn/ui · React Hook Form + Zod · TanStack Table · Recharts · PostgreSQL on Neon (pooled) · Prisma · **Better Auth** · Cloudflare R2 · Resend (via transactional outbox) · React PDF · Vercel Cron · Sentry · Pino · Vitest + Playwright.

### Do NOT use
- **NextAuth / Auth.js v5** — beta / maintenance-only, no built-in RBAC. Use Better Auth.

### Do NOT build in v1
Redis cache, PostHog, Trigger.dev, **all AI features**, WhatsApp Business API, customer self-service portal, payment gateway, multi-tenancy, multi-currency, SMS reminders, mobile native apps. These are Phase 2/3 — do not pre-build hooks or scaffolding for them.

## Architecture in one paragraph

Modular monolith. **UI → Server Actions → Services → Repositories → Prisma → Postgres.** UI never imports Prisma. Server actions only: parse with Zod → load session → `can(...)` → call service → return `ActionResult`. Services own business logic, take a `UserContext`, never read `cookies()`/`headers()`. Repositories are pure data access, one file per aggregate root. Cross-module calls go service → service. Layout details in `ARCHITECTURE.md §3–4`.

## Folder structure (summary)

There is **no `src/` directory** — everything lives at the repo root. The path alias `@/*` maps to `./*` (root), so imports read `@/modules/...`, `@/lib/...`, `@/components/...`.

```
app/                    Next.js routes only (thin)
  (app)/                authenticated app pages (dashboard, leads, customers, …)
  api/                  route handlers: auth, cron, documents, healthz, quotations
  login/  signup/       public auth pages
modules/<name>/         <name>.actions.ts, <name>.service.ts, <name>.repository.ts,
                        <name>.schemas.ts, <name>.types.ts  (files are name-prefixed)
lib/                    auth, db.ts/db-direct.ts, audit, errors, logger, money, phone,
                        storage, email, numbering, time, env, permissions, charts, hooks, cn.ts
components/             shared UI: ui/ (shadcn primitives) + charts, common, forms, tables, layout, …
prisma/                 schema.prisma, migrations, seed.ts
tests/                  unit/ + integration/ (Vitest), e2e/ (Playwright), factories/, stubs/
```

Key deviations from `ARCHITECTURE.md §4`: modules contain **no `ui/` subfolder** (page/feature UI lives in `app/` + `components/`) and **no per-module `permissions.ts`** — the permission catalog and policy map are **centralized in `lib/permissions/`** (`permissions.ts`, `rbac.ts`, `helpers.ts`) and imported by services via `@/lib/permissions`.

## Roles (v1)

`ADMIN`, `MANAGER`, `AGENT`, `ACCOUNTANT`. Permission matrix in `ARCHITECTURE.md §6.2`. `AGENT` access is ownership-scoped via `assignedAgentId`.

## Build order

Strictly per `TASKS.md`:
0. **Scaffold:** Next.js, Tailwind, shadcn, Prisma+Neon, Better Auth, permissions, audit, logger, money, env, seed, deploy.
1. **Phase 1:** Users → Customers → Customer import → Leads (kanban+list) + Interactions → Tasks + Cron → Bookings → Payments → Quotations + PDF → Documents → Dashboard → Settings → Audit viewer → Critical-path Playwright.

Do not start Phase 2 until Phase 1 is in daily use.

## Branching & deploy gate

`master` is **protected** and auto-deploys to production on every update, so it must stay green. Do **not** push to `master` directly — it is rejected. Flow: branch → push → open a PR → CI (`Lint · Typecheck · Test · Build`) + a Vercel preview run → **merge once green**. The merge to `master` is what ships to prod. (Emergency bypass: an admin can temporarily lift protection in repo settings.)

## Common pitfalls to avoid

- Don't store money in `number`. Don't `JSON.stringify` an entity before redaction.
- Don't write a permission check inline (`if (user.role === 'AGENT') ...`) — extend the policy module instead.
- Don't call Prisma from a server component or UI. Don't call a service from UI — go through a server action.
- Don't compute quote/invoice numbers with `MAX()+1`. Use the sequence helper.
- Don't paste a signed R2 URL into an email; link to the gated download page.
- Don't send an email from a service body; enqueue an `EmailOutbox` row in the same transaction.
- Don't add a Redis or PostHog dependency — both are explicitly deferred.
- Don't call `cookies()` or `headers()` inside a service — services take a `UserContext` argument.
- Don't import from another module's `repository.ts` or `schemas.ts` — go through its `service.ts`.

## Commands

Package manager is **pnpm** (see `pnpm-workspace.yaml`). Node ≥ 22.13 (`.nvmrc`; pnpm 11 requires it).

| Task | Command |
| --- | --- |
| Dev server (Turbopack) | `pnpm dev` |
| Production build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck (no emit) | `pnpm typecheck` |
| Format | `pnpm format` |
| Unit/integration tests (watch) | `pnpm test` |
| Single test run, no watch | `pnpm exec vitest run tests/unit/customers.service.test.ts` |
| Filter by name | `pnpm exec vitest run -t "raises ConflictError"` |
| E2E tests | `pnpm test:e2e` (single: `pnpm exec playwright test tests/e2e/auth.spec.ts`) |
| Prisma migrate (dev) | `pnpm prisma:migrate` |
| Prisma migrate (deploy) | `pnpm prisma:deploy` |
| Prisma Studio | `pnpm prisma:studio` |
| Seed (ADMIN from env) | `pnpm seed` |
| Regenerate Better Auth tables | `pnpm auth:generate` |

Testing notes:
- Vitest runs `tests/unit/**` and `tests/integration/**` in the Node environment. Services import `server-only`, which throws outside an RSC bundle, so Vitest aliases it to a stub (`tests/stubs/server-only.ts`) — keep that alias when adding config.
- Playwright owns `tests/e2e/**` (excluded from `tsconfig` and Vitest); run it with `pnpm test:e2e`, not `pnpm test`.
- `prisma generate` runs automatically on `postinstall`.
