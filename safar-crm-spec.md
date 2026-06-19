# Safar CRM — Build Specification

> A CRM for a single Pakistani travel agency. Internal tool for staff. Build this with Claude Code, MVP first.

---

## 1. Purpose

Capture every enquiry, move it through to a booking, remember every customer and every interaction, and never miss a follow-up or a payment. This is an internal staff tool — there is **no public customer portal in v1**.

---

## 2. Build philosophy (read before coding)

1. **Ship the MVP before adding infrastructure.** Every "platform" feature — caching, product analytics, background-job platforms, AI — is deferred until the core CRM is in daily use. Do not build deferred items in v1.
2. **Security and money correctness are non-negotiable from day one.**
3. **Mobile-first and responsive.** Agents use phones. Every screen must work on a small viewport.
4. **Single agency, single tenant.** No multi-tenancy.
5. **Currency is PKR only in v1.** Store money as **integer paisa** (or Prisma `Decimal`). **Never use float for money.**

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, TypeScript strict, Turbopack) | 15 reaches end-of-support Oct 2026 — start on 16 |
| Styling | Tailwind CSS + **shadcn/ui** | Dialogs, tables, forms, tabs, toasts |
| Forms | React Hook Form + **Zod** | Zod validates every server action input |
| Tables | TanStack Table | Filtering, pagination, sorting, column visibility |
| Charts | Recharts | Dashboard only |
| Database | **PostgreSQL on Neon** | Use Neon's **pooled** connection string for serverless |
| ORM | **Prisma** | Configure pooling (`?pgbouncer=true` or driver adapter) |
| Auth | **Better Auth** | Sessions in Postgres, real RBAC, actively maintained |
| Files | **Cloudflare R2** | Private buckets, signed URLs, encryption at rest |
| Email | Resend | Quotations, confirmations, password reset, reminders |
| WhatsApp | `wa.me` click-to-chat (v1) | WhatsApp Business API later |
| PDF | React PDF (or print-CSS) | Quotations, invoices, vouchers |
| Background jobs | **Vercel Cron** (v1) | Trigger.dev later, only if jobs grow complex |
| Monitoring | Sentry | Keep from day one |
| Logging | Pino | Keep from day one |
| Deployment | Vercel + Neon + R2 | — |
| Testing | Vitest + Playwright | Critical paths only at first (see §9) |

### Do NOT use
- **NextAuth / Auth.js v5** — still beta after ~2.5 years, now maintenance-only, no built-in RBAC. Use Better Auth instead. (Clerk is an acceptable managed alternative if you want the fastest setup.)

### Deferred — do not build in v1
- Redis cache · PostHog · Trigger.dev · all AI features

### Security note on authorization
Do **not** rely on `proxy.ts` / middleware alone for access control — middleware-only auth in Next.js has known bypasses. Enforce permissions **inside server actions and the data layer** via a central `requireRole(user, ...)` / `can(user, action, resource)` helper. Every mutation checks the role.

---

## 4. Roles & permissions (v1)

Roles: `ADMIN`, `MANAGER`, `AGENT`, `ACCOUNTANT`. (`CUSTOMER_SUPPORT` optional; a `CUSTOMER` self-service role is out of scope for v1.)

| Role | Access |
|---|---|
| ADMIN | Everything, including user management and settings |
| MANAGER | All customers / leads / bookings / quotations across agents; reports; can reassign leads |
| AGENT | Own and shared customers / leads / bookings / quotations; cannot see agency-wide financials |
| ACCOUNTANT | Payments, invoices, financial reports; read-only on leads and bookings |

---

## 5. Lead pipeline (lifecycle)

`NEW → CONTACTED → QUOTATION_SENT → NEGOTIATING → BOOKED → TRAVELLED`, with `LOST` as an exit available at any stage.

Render as a **kanban board** with a **list/table view** toggle.

---

## 6. Data model — MVP tables

> All tables get `id`, `createdAt`, `updatedAt`. Use **enums** for every status field. Use **soft delete** (`deletedAt`) on Customers, Leads, Bookings — never hard-delete. Add indexes on all foreign keys and a unique index on `User.email`.

### User
`id, name, email (unique), role (enum), avatar, isActive, createdAt`
Passwords are handled by Better Auth (hashed) — do not store plaintext.

### Customer
`id, name, email, phone, nationality, passportNo, passportExpiry, dob, address, notes, assignedAgentId (FK User), createdAt, deletedAt`
> `passportNo`, `passportExpiry`, `dob` are sensitive PII — see §8.

### Lead  *(entry point — does NOT require a Customer first)*
`id, contactName, contactPhone, contactEmail, customerId (FK Customer, NULLABLE), status (enum NEW…LOST), source, assignedAgentId (FK User), destination, tripType (enum), pax, budgetPaisa (int), travelDate, createdAt, deletedAt`
> Capture contact details on the Lead itself. Create/link a `Customer` only on conversion to BOOKED.

### Interaction  *(NEW — the heart of the CRM)*
`id, leadId (FK, nullable), customerId (FK, nullable), type (enum: CALL, WHATSAPP, EMAIL, MEETING, NOTE), body, occurredAt, createdById (FK User)`

### Task  *(NEW — drives reminders)*
`id, title, dueDate, status (enum: OPEN, DONE), type (enum: FOLLOW_UP, PASSPORT_EXPIRY, PAYMENT_DUE, OTHER), leadId (FK, nullable), customerId (FK, nullable), assignedToId (FK User)`

### Booking
`id, customerId (FK), leadId (FK, nullable), packageId (FK, nullable), bookingDate, travelDate, status (enum: PENDING, CONFIRMED, TICKETED, COMPLETED, CANCELLED), totalPricePaisa (int), currency (default 'PKR'), notes`

### Payment  *(recording, not gateway processing in v1)*
`id, bookingId (FK), amountPaisa (int), method (enum: CASH, BANK_TRANSFER, CARD, OTHER), status (enum: UNPAID, PARTIAL, PAID, REFUNDED), reference, paidAt, recordedById (FK User)`
> v1 = manual entry of amounts received + computed balance due. No payment gateway.

### Quotation
`id, customerId (FK, nullable), leadId (FK, nullable), quoteNumber (unique), validTill, subtotalPaisa, taxPaisa, discountPaisa, totalPaisa, status (enum: DRAFT, SENT, ACCEPTED, EXPIRED)`

### Invoice
`id, bookingId (FK), invoiceNumber (unique), amountPaisa (int), status (enum: ISSUED, PAID, CANCELLED), issuedAt`

### Document  *(NEW — tracks files in R2)*
`id, customerId (FK, nullable), bookingId (FK, nullable), type (enum: PASSPORT, VISA, TICKET, INVOICE, VOUCHER, OTHER), fileKey (R2), fileName, expiryDate (nullable), uploadedById (FK User)`

### AuditLog  *(NEW)*
`id, actorId (FK User), action, entity, entityId, before (json), after (json), createdAt`
Record changes to Bookings and Payments at minimum.

### Package  *(OPTIONAL — only if you sell fixed packages)*
`id, title, destination, description, durationDays, pricePaisa, hotel, included, excluded, status`
> If the agency works on bespoke quotes, treat Packages as a template library, not a core entity.

---

## 7. Features by phase

### Phase 1 — MVP (build this first)
- Auth + roles (Better Auth), seed one ADMIN
- Customer records: CRUD, search, list (TanStack Table)
- **CSV / Excel customer import** (day-one adoption driver)
- Lead pipeline: kanban + list, drag/advance through stages, assign to agent
- **Interaction logging** (call / WhatsApp / email / meeting / note), with `wa.me` click-to-chat links
- **Tasks & reminders**: follow-ups + passport-expiry alerts, swept by a **Vercel Cron** job that emails the owner via Resend
- Bookings (basic)
- **Payment recording** with balance-due tracking
- Quotations + PDF export
- Dashboard: active enquiries, conversion rate, revenue booked, upcoming travel, expiring passports
- Sentry + Pino

### Phase 2
- Invoices + accountant workflows
- Richer reporting (revenue by agent, top destinations, lead source performance)
- Document management UI (upload/preview, expiry tracking)
- Email templates via Resend
- Supplier/vendor records
- Trigger.dev (only if Cron is no longer enough)

### Phase 3
- WhatsApp Business API (templated messages, confirmations, reminders)
- AI itinerary generator + AI email writer (**Anthropic Claude API** or OpenAI)
- AI customer chatbot (with strict guardrails — must not state prices/policies it can't verify)
- Customer self-service portal
- PostHog, Redis (only if measured need)

---

## 8. Non-functional requirements

- **Money:** integer paisa (or `Decimal`); single currency PKR in v1; never float.
- **PII:** passport scans, visa scans, DOB are sensitive. Private R2 buckets, signed URLs, downloads gated by role, encryption at rest. Soft-delete, never hard-delete. Audit changes.
- **Database pooling:** Neon pooled connection string for Prisma on Vercel.
- **Validation:** Zod on every server action input.
- **Constraints:** unique `User.email` and document/quote/invoice numbers; FK indexes; enums for all statuses; `createdAt`/`updatedAt` everywhere.
- **Responsive:** mobile-first; the table-heavy screens must collapse gracefully on phones.

---

## 9. Suggested build order for Claude Code

1. Scaffold Next.js 16 + TS strict + Tailwind + shadcn. Set up Prisma + Neon (pooled). Configure Better Auth with the four roles. Seed an ADMIN user.
2. Customer CRUD + search/list + **CSV import**.
3. Lead pipeline (kanban + list) + **Interaction logging** + `wa.me` links.
4. Tasks/reminders + **Vercel Cron** sweep (follow-ups, passport expiry) + Resend email.
5. Bookings + **manual Payments** (balance tracking).
6. Quotations + PDF.
7. Dashboard + Recharts.
8. Sentry + Pino + Playwright tests for the critical paths: login, create lead, convert lead → booking, record payment, role permissions.

Then proceed to Phase 2.
