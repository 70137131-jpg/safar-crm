# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Greenfield. The working tree currently contains only design documents — a prior Vite/React skeleton exists in the initial git commit but has been deleted (uncommitted). Re-scaffolding follows `TASKS.md §0`.

## Source of truth (read in this order)

1. `ARCHITECTURE.md` — design and decisions; **binding**.
2. `PRD.md` — what to build and why.
3. `TASKS.md` — phased build order; do not jump ahead.
4. `safar-crm-spec.md` — original product spec (background context).

This file (`CLAUDE.md`) is the day-to-day operating guide. Anything that contradicts `ARCHITECTURE.md` belongs there, not here.

## What this is

Safar CRM — internal staff tool for a single Pakistani travel agency. Captures enquiries, moves leads to bookings, tracks every interaction, surfaces follow-ups and payments. No public customer portal in v1. Single tenant, PKR only, mobile-first.

## Non-negotiable rules

- **Money is `bigint` paisa.** Never `number` / float. Use `src/lib/money/paisa.ts`. (See `ARCHITECTURE.md §2.2`.)
- **Soft delete only** on Customers, Leads, Bookings (`deletedAt`). Reads filter `deletedAt IS NULL` at the repository layer; only an explicit `includeDeleted: true` flag bypasses it.
- **Authorization inside services, not middleware.** Call `requirePermission(user, perm)` or `can(user, perm, resource)`. Middleware does session refresh only — never access control.
- **Zod validates every server action input.**
- **PII (`passportNo`, `passportExpiry`, `dob`, file keys)** never appears in logs, Sentry payloads, or `AuditLog.before/after`. Pino's redaction list and `redactPII()` enforce this. Passport masked to last-4 in audit JSON.
- **AuditLog every mutation.** Wrap services with `withAudit(...)` inside the same transaction. AuditLog is append-only at the DB role level.
- **Signed URLs are 5-min, route-mediated, never embedded in emails.** Emails link to gated download pages.
- **Optimistic concurrency on lead stage transitions** via `updatedAt`.
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

```
src/app/                Next.js routes only (thin)
src/modules/<name>/     actions.ts, service.ts, repository.ts, schemas.ts, permissions.ts, ui/
src/lib/                auth, db, audit, errors, logger, money, phone, storage, email, pdf, numbering, time, env
src/ui/                 shared components + shadcn primitives
prisma/                 schema, migrations, seed
tests/                  unit, integration, e2e
```

Full tree in `ARCHITECTURE.md §4`.

## Roles (v1)

`ADMIN`, `MANAGER`, `AGENT`, `ACCOUNTANT`. Permission matrix in `ARCHITECTURE.md §6.2`. `AGENT` access is ownership-scoped via `assignedAgentId`.

## Build order

Strictly per `TASKS.md`:
0. **Scaffold:** Next.js, Tailwind, shadcn, Prisma+Neon, Better Auth, permissions, audit, logger, money, env, seed, deploy.
1. **Phase 1:** Users → Customers → Customer import → Leads (kanban+list) + Interactions → Tasks + Cron → Bookings → Payments → Quotations + PDF → Documents → Dashboard → Settings → Audit viewer → Critical-path Playwright.

Do not start Phase 2 until Phase 1 is in daily use.

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

(To be filled in as scaffolding lands. Until `package.json` exists, there is no `pnpm dev` etc.)
