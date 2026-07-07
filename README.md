# Safar CRM

Safar CRM is a private internal CRM for a single Pakistani travel agency. It is built to capture enquiries, manage customers and leads, track every interaction, generate quotations and bookings, and keep follow-ups and payments visible to staff across the business.

Live app: [safar-crm.vercel.app](https://safar-crm.vercel.app/)

## What it does

Safar CRM is the system of record for day-to-day travel operations. It helps the team:

- capture new enquiries quickly from phone, WhatsApp, or email follow-ups
- move leads through a clear pipeline from first contact to booking
- keep customer details, passport data, and documents organized securely
- record payments, invoices, quotations, and booking information in one place
- surface reminders, follow-ups, dashboard summaries, and audit history
- support mobile-first use for agents working on phones and tablets

It is intentionally not a public customer portal and not a multi-tenant SaaS product.

## Core modules

- Auth and staff access management
- Users and role-based permissions
- Customers with import support
- Leads with kanban and list views
- Interactions and activity history
- Tasks and reminder automation
- Bookings and payment tracking
- Quotations with PDF generation
- Documents and gated downloads
- Dashboard reporting
- Agency settings
- Audit log viewer

## Tech stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS and shadcn/ui
- React Hook Form and Zod
- Prisma with PostgreSQL on Neon
- Better Auth for authentication
- Cloudflare R2 for document storage
- Resend for transactional email via outbox
- Recharts and TanStack Table for reporting and data views
- Vitest and Playwright for testing
- Pino and Sentry for logging and observability

## Project structure

This repository does not use a `src/` directory. The main folders are:

- `app/` for Next.js routes and pages
- `components/` for shared UI and layout primitives
- `lib/` for app-wide utilities such as auth, database access, permissions, audit, money, storage, and logging
- `modules/` for feature logic split by domain
- `prisma/` for the Prisma schema, migrations, and seed script
- `tests/` for unit, integration, and end-to-end tests

The architecture follows a modular monolith pattern:

UI -> Server Actions -> Services -> Repositories -> Prisma -> Postgres

## Getting started

### Prerequisites

- Node.js 22.13 or newer
- pnpm
- PostgreSQL access for local development

### Install

```bash
pnpm install
```

### Environment setup

Create a local `.env` file with the variables required by the app, including database, auth, email, storage, and observability settings used by your deployment environment.

If you are unsure which values are required, check the existing configuration files and deployment notes in the repository.

### Run locally

```bash
pnpm dev
```

The development server runs with Turbopack.

### Database

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm seed
```

- `pnpm prisma:generate` regenerates the Prisma client
- `pnpm prisma:migrate` applies local schema changes
- `pnpm seed` seeds the database with initial data

## Available scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Build the production app |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm format` | Format the codebase with Prettier |
| `pnpm prisma:generate` | Generate Prisma client code |
| `pnpm prisma:migrate` | Run a local Prisma migration |
| `pnpm prisma:deploy` | Apply migrations in deployment environments |
| `pnpm prisma:studio` | Open Prisma Studio |
| `pnpm seed` | Seed the database |
| `pnpm test` | Run Vitest in watch mode |
| `pnpm test:db` | Run integration tests that require a database |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm db:verify-runtime-role` | Verify the runtime database role |
| `pnpm auth:generate` | Regenerate Better Auth tables in the Prisma schema |

## Development notes

- Money is stored as bigint paisa, not floating point numbers.
- Authorization checks live in services, not middleware.
- Sensitive PII must not be written to logs, Sentry payloads, or audit diffs.
- Soft delete is used for customers, leads, and bookings.
- Signed document URLs are route-mediated and short-lived.
- Email is sent through a transactional outbox, not directly from service code.

## Deployment

The app is designed to run on Vercel with PostgreSQL on Neon, private document storage on Cloudflare R2, and Resend for outbound email. Production builds should be verified with the same commands used in CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentation

Additional project docs live in the repository root:

- `ARCHITECTURE.md` for the implementation design and conventions
- `PRD.md` for product goals and requirements
- `TASKS.md` for the build order
- `TESTING.md` for testing guidance
- `SECURITY.md` for security rules and operational expectations
