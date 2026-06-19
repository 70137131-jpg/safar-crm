# OBSERVABILITY.md — Safar CRM

**Audit date:** 2026-06-20
**Pillars:** structured logs (Pino), error tracking (Sentry), and the application audit trail (AuditLog).

---

## 1. Verdict

The three observability pillars are wired and PII-safe. This pass closed two explicit gaps by **adding code**: Sentry now receives **cron failures** (previously logged to Pino only) and **the acting user id** is attached to error traces. Remaining items are low-priority enhancements (a true request-correlation id, structured cron timing) listed in §6.

| Signal | Status |
|--------|--------|
| Structured logs w/ PII redaction | ✅ Pino + global redact list |
| Error tracking | ✅ Sentry (server/edge/client), prod-only, PII-stripped |
| User id on errors | ✅ **added** (`Sentry.setUser` in session) |
| Cron failure traces | ✅ **added** (`Sentry.captureException` in all 6 routes) |
| Payment / quotation / booking traces | ✅ via AuditLog (`withAudit`) + status-event tables |
| Audit trail (who/what/when) | ✅ append-only design (activate `crm_app` — see SECURITY.md §6) |
| Request-correlation id | ⚠️ not present in Pino logs (recommendation, §6) |

---

## 2. Logging — Pino (`lib/logger.ts`)

- Single Pino instance, level from `LOG_LEVEL`, base field `{ env }`, pretty transport in dev only.
- **Global PII redaction** (`redact.paths`) covers `passportNo`, `dob`, `passportExpiry`, `password`, `token`, `sessionToken`, `authorization`, `cookie`, `headers.cookie/authorization`, `fileKey`, `signedUrl`, and free-text `body` — at depths up to `*.*.field`. Censored to `[REDACTED]`.
- **Server actions** log through the `serverAction` wrapper with `{ action, code }` context: Zod issues at `warn`, expected `AppError`s at `warn`, unexpected errors at `error` (+ Sentry). Next.js control-flow (redirect/notFound) is **rethrown, not logged** (fixed this pass — see SECURITY.md §3).
- **Cron** routes log a structured success line (`cron.<name>`, with result counts) and an error line (`cron.<name>_failed`) on failure.
- **Outbox** logs `outbox.send_failed` per failed email with attempt count and exhaustion flag.

## 3. Error tracking — Sentry

- `instrumentation.ts` registers the server/edge configs and exports `onRequestError = Sentry.captureRequestError` (App Router server-component + route errors flow to Sentry).
- **Server** (`sentry.server.config.ts`): `tracesSampleRate 0.1`, `enabled` only in production, `beforeSend` deletes `request.cookies` and `request.headers` (defense against PII/secret leakage).
- **Edge** (`sentry.edge.config.ts`): same sampling, prod-only.
- **Client** (`instrumentation-client.ts`): `NEXT_PUBLIC_SENTRY_DSN`, error-replay at 100% (`replaysOnErrorSampleRate: 1.0`), no always-on session replay (`replaysSessionSampleRate: 0`) — captures the session only when an error occurs.
- **New this pass:** `Sentry.setUser({ id, role })` in `getCurrentUser` (`lib/auth/session.ts`) — every server error during an authenticated request now carries the actor's id and role (never PII). The app's `error.tsx`/`global-error.tsx` boundaries also `captureException` client-side render errors.
- **New this pass:** each `/api/cron/*` route calls `Sentry.captureException(err, { tags: { cron: "<name>" } })` so a failing scheduled job raises a tagged Sentry issue instead of dying silently in logs.

## 4. Audit trail — AuditLog (`lib/audit/`)

- `withAudit(entry, fn)` runs the mutation and writes one `AuditLog` row **inside the same transaction** — the change and its audit record commit or roll back together.
- Audited mutations include the financially-sensitive flows explicitly requested:
  - **Payments** — `payment.record`, `payment.refund`, `payment.void` (before/after captured).
  - **Quotations** — create/update/send/accept/expire (+ totals frozen by DB trigger after DRAFT).
  - **Bookings** — create/status-change/cancel (+ a dedicated `BookingStatusEvent` table for time-in-stage).
  - **Leads** — stage transitions (+ `LeadStatusEvent` table), with OCC on transitions.
  - **Customers / Documents / Users / Settings** — create/update/delete/restore/import.
- `before`/`after` snapshots pass through `redactPII()` (passport masked to last-4; dob/tokens/fileKeys stripped; BigInt stringified).
- `actorId` is nullable so **cron/system writes** are attributable to "system" rather than a user.
- Append-only is enforced at the DB role level **once `crm_app` is active** — see SECURITY.md §6 / DATABASE_AUDIT.md §6. Until then, treat audit as advisory.
- A read path exists (`audit:view` permission, ADMIN/MANAGER) for the in-app audit viewer.

## 5. What to watch in production

- **Sentry issues tagged `cron:*`** — any scheduled-job failure (now surfaced).
- **`outbox.send_failed`** with `exhausted: true` — an email hit `maxAttempts` (default 5) and is now `FAILED`; investigate Resend/credentials.
- **`audit.write_failed`** — an audit insert failed; because it's in-transaction, the parent mutation also rolled back. Indicates a DB/permission problem.
- **`/api/healthz`** — DB-ping health endpoint for uptime monitoring.

## 6. Recommendations (low priority)

1. **Request-correlation id.** Pino logs aren't correlated across a single request. Generate/propagate a request id (e.g. from a header in `middleware.ts` or a `headers()` read) and include it in the `serverAction` log context, so all log lines for one action share an id. Sentry already provides trace ids; this aligns Pino with them.
2. **Structured cron timing.** The cron success logs include counts; adding `durationMs` per sweep gives a cheap latency signal without external APM.
3. **Sentry release + source maps.** Wire `SENTRY_ORG`/`SENTRY_PROJECT` (already in env) into the build so stack traces de-minify; tag events with the Vercel deployment SHA for per-release triage.
4. **Outbox transaction shape.** Move the Resend network call outside the claim transaction (see PERFORMANCE.md §5) — also improves trace clarity (DB vs network spans).
