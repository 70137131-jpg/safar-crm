# Safar CRM — Product Requirements

> The "what" and "why". Pair with `ARCHITECTURE.md` (the "how") and `TASKS.md` (the "in what order").

## 1. Product summary

Safar CRM is a private internal tool for a single Pakistani travel agency. It is the system of record for every enquiry, customer, interaction, quotation, booking, and payment. It exists to keep enquiries from leaking out of email/WhatsApp into nothing, to make follow-ups unmissable, and to give the agency a real view of conversion and revenue.

It is not a customer portal. It is not a multi-tenant SaaS. It will not become a public product in v1.

## 2. Users & personas

| Persona      | Role         | Day-to-day                                                                                |
|--------------|--------------|-------------------------------------------------------------------------------------------|
| Owner        | ADMIN        | Manages users, reviews everything, owns settings and PDF templates.                       |
| Branch head  | MANAGER      | Oversees agents, reassigns leads, sees the agency-wide pipeline and revenue.              |
| Travel agent | AGENT        | Captures leads from WhatsApp/phone, sends quotes, books trips, records payments received. |
| Accountant   | ACCOUNTANT   | Records bank/card payments, reconciles, issues invoices, runs financial reports.          |

Mobile use is the default for AGENT — they work on phones at desks and on the move.

## 3. Roles & access summary

(See `ARCHITECTURE.md §6.2` for the full permission matrix.)

- **ADMIN** — everything, plus user/role management and settings.
- **MANAGER** — all leads/customers/bookings/quotations across agents; reassignment; financial and operational reports.
- **AGENT** — only own (assigned) records; cannot see agency-wide financials; may record CASH receipts only on own bookings.
- **ACCOUNTANT** — payments, invoices, financial reports; read-only on leads and bookings.

## 4. Lead pipeline

`NEW → CONTACTED → QUOTATION_SENT → NEGOTIATING → BOOKED → TRAVELLED`, with `LOST` as an exit from any stage.

- Default view: **kanban board**, columns per stage, drag to advance.
- Toggle to **list/table view** (TanStack Table) with the same data.
- Filtering: status, agent, source, destination, travel-month, created-at range.
- Conversion to BOOKED is a workflow that creates/links a `Customer` and creates a `Booking` atomically.

## 5. Modules

### 5.1 Auth
- **Purpose:** authenticated sessions for staff.
- **Stories:**
  - As a user I can log in with email + password.
  - As a user I can request a password reset link.
  - As a user I am logged out after 12 hours of inactivity or 7 days absolute.
- **Acceptance:**
  - Account lockout after 5 failed logins in 10 min.
  - Password reset link single-use, 30 min TTL.
  - Sessions HttpOnly + Secure + SameSite=Lax cookies.

### 5.2 Users
- **Purpose:** manage staff accounts.
- **Stories:**
  - As ADMIN I can invite a user (email, name, role); the system emails an invite link to set a password.
  - As ADMIN I can change a user's role.
  - As ADMIN I can deactivate a user; their session ends and they are locked out.
- **Acceptance:**
  - Deactivating a user with active assigned leads/bookings prompts ADMIN to reassign first.
  - Hard-delete is forbidden by policy.

### 5.3 Customers
- **Purpose:** master records, incl. PII.
- **Stories:**
  - As an AGENT I can create a customer with contact details and (optional) passport.
  - As an AGENT I can edit my customers' records.
  - As an AGENT I can search by name, phone, email, passport (last-4).
  - As a MANAGER I can import a CSV/XLSX of customers and see per-row errors.
  - As an AGENT I cannot see customers assigned to other agents.
- **Acceptance:**
  - Phone stored E.164; UI accepts local `03xx-xxxxxxx` and prefixes `+92`.
  - `passportExpiry < today + 6 months` flags an automatic `Task(type=PASSPORT_EXPIRY)`.
  - PII columns never appear in audit JSON or logs (last-4 mask for passport; DOB removed).

### 5.4 Leads
- **Purpose:** capture & nurture enquiries.
- **Stories:**
  - As an AGENT I can create a lead in ≤10 seconds from a phone form (name, phone, destination, travel month).
  - As an AGENT I can drag a lead to a new stage on kanban (mobile-friendly).
  - As a MANAGER I can reassign a lead.
  - As an AGENT I can convert a lead to a booking; the system creates/links a customer.
- **Acceptance:**
  - Stage transition is atomic; concurrent edits fail with a "refresh and retry" message.
  - Kanban is usable on a 360px viewport (horizontal scroll columns + tap-to-move fallback).
  - `LOST` transition requires a reason (enum + optional note).
  - Conversion creates `Customer` (if not linked) + `Booking` + interaction trail in one transaction.

### 5.5 Interactions
- **Purpose:** complete touchpoint history.
- **Stories:**
  - As an AGENT I can log a call / WhatsApp / email / meeting / note against a lead or customer.
  - As an AGENT I can click "WhatsApp" and have an interaction auto-created.
- **Acceptance:** An interaction belongs to exactly one of (lead, customer); enforced in DB.

### 5.6 Tasks
- **Purpose:** never miss a follow-up.
- **Stories:**
  - As an AGENT I see my open tasks ordered by due date.
  - As an AGENT I get an email at 08:00 PKT the day a task is due (or earlier if marked urgent).
  - As the system, I auto-create passport-expiry and payment-due tasks.
- **Acceptance:** Email reminders are idempotent — no duplicate emails per task per day.

### 5.7 Bookings
- **Purpose:** record confirmed trips and totals.
- **Stories:**
  - As an AGENT I can create a booking linked to a customer.
  - As an AGENT I can update notes and travel date.
  - As a MANAGER I can cancel a booking with a reason.
- **Acceptance:**
  - `totalPricePaisa` is `bigint`. UI input is PKR with optional paisa; stored as integer paisa.
  - Cancellation is a status change, not a delete; existing payments remain visible.

### 5.8 Payments
- **Purpose:** record what's been received, compute what's owed.
- **Stories:**
  - As an ACCOUNTANT I can record a bank/card payment on a booking.
  - As an AGENT I can record a cash receipt on my booking.
  - As anyone with access I can see balance due.
- **Acceptance:**
  - Balance due = `totalPricePaisa - SUM(payment.amountPaisa WHERE status='PAID')`.
  - Refunds recorded as `status=REFUNDED` rows with negative effective amount; original PAID row is not mutated.

### 5.9 Quotations
- **Purpose:** prepare and send quotes.
- **Stories:**
  - As an AGENT I can draft a quote, save as DRAFT.
  - As an AGENT I can mark a quote SENT; the system assigns `SQ-YYYY-NNNNNN`, generates a PDF, and emails it via Resend.
  - As an AGENT I can mark a quote ACCEPTED or EXPIRED.
- **Acceptance:** Quote numbers monotonic; no duplicates under concurrency. Numbers issued only on SENT.

### 5.10 Invoices (Phase 2)
- Scope is schema + read-only viewing in v1; full workflow Phase 2.

### 5.11 Documents
- **Purpose:** uploads of passport scans, vouchers, tickets.
- **Stories:**
  - As an AGENT I can upload a passport scan against a customer.
  - As an AGENT I can download a document via a permission-checked link.
- **Acceptance:**
  - Max size 25 MB; types PDF / JPEG / PNG.
  - Download URL is route-mediated, 5-minute TTL.
  - Every download writes an audit entry.

### 5.12 Dashboard
- **Cards:** active enquiries (count + delta), conversion rate (this month vs last), revenue booked (this month), upcoming travel (next 30 days), expiring passports (next 60 days).
- **Charts:** monthly bookings & revenue (Recharts); top destinations.
- **Scope:** numbers respect the viewing role (AGENT sees own; MANAGER/ADMIN/ACCOUNTANT see all).

### 5.13 Settings
- Agency profile (name, address, logo, tax registration) used in PDFs.
- Lead sources (editable list).
- ADMIN only.

### 5.14 Audit log viewer
- ADMIN/MANAGER can browse audit entries, filter by entity/actor/date.
- Diff view for `before/after`.

## 6. Non-functional requirements

### 6.1 Security
- All authorization decisions inside services; middleware does session refresh only.
- All sensitive PII columns redacted in logs, Sentry payloads, and audit JSON.
- R2 buckets private; downloads via signed URLs minted at request time.
- Rate limits on auth, password reset, and import endpoints.
- AuditLog append-only at the DB role level.

### 6.2 Performance
- p95 page load < 2.5 s on 4G; p95 server action < 600 ms.
- Lists paginated server-side (page size 50, configurable to 100).

### 6.3 Reliability
- Vercel Cron + idempotent handlers.
- Email via transactional outbox (no email-without-DB-write or vice versa).
- Neon PITR; documented RPO 1h / RTO 4h.

### 6.4 Accessibility & UX
- WCAG 2.1 AA targets for color contrast and keyboard nav.
- Mobile viewport 360px minimum; data tables collapse to card layout under 640px.

### 6.5 Localization
- v1: English UI, PKR currency, PKT time zone.
- Phone numbers normalized E.164.

### 6.6 Data correctness
- Money in `bigint` paisa; no float anywhere.
- Soft delete on Customers, Leads, Bookings.
- Unique partial indexes for soft-deleted columns where re-creation must be possible.

## 7. Out of scope for v1
- Customer self-service portal.
- WhatsApp Business API (only `wa.me`).
- AI features (itinerary, email writing, chatbot).
- Payment gateway / online payments.
- Multi-currency, multi-tenant, multi-language.
- Mobile native apps (responsive web only).
- SMS reminders (email only).
- Trigger.dev, Redis, PostHog.

## 8. Roadmap

- **Phase 1 (MVP):** auth, users, customers (+ import), leads (kanban + list), interactions, tasks/reminders, bookings, payments, quotations + PDF, dashboard, documents (basic), settings, audit log, Sentry + Pino.
- **Phase 2:** invoicing workflows, richer reports, document management UI w/ expiry tracking, email templates editor, supplier/vendor records, Trigger.dev (only if Cron insufficient).
- **Phase 3:** WhatsApp Business API, AI itinerary/email writers (with guardrails), customer portal, PostHog, Redis (only if measured need).

## 9. Success metrics (post-launch)
- ≥ 95% of new enquiries entered in CRM within 24 hours of first contact.
- ≥ 90% of quotations sent via CRM (not external email).
- Average lead-to-quote and quote-to-booked times measured and reported monthly.
- Zero P0 security incidents.
- 100% of bookings have at least one Payment row (paid or pending).
- Every mutation present in `AuditLog`.

## 10. Acceptance pattern (applied to every story)

A story is "done" when:
1. Server action validates input with Zod.
2. Authorization is checked via `requirePermission` / `can`.
3. Mutation is wrapped in `withAudit`.
4. Money fields use `Paisa` (bigint).
5. Soft-delete and ownership filters applied at the repository layer.
6. UI works on 360px viewport.
7. Unit tests cover service logic + permission edges.
8. Playwright e2e covers the happy path if the story is on the critical-path list.
