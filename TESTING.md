# TESTING.md — Safar CRM

**Updated:** 2026-06-20
**Stack:** Vitest (unit + integration) · Playwright (E2E) · existing test architecture under `tests/`.

---

## 1. Current status

- **Unit + integration: 246 tests across 14 files — all green** (`pnpm test`). Verified this pass.
- **Typecheck + production build: green** (`pnpm typecheck`, `pnpm build`).
- **E2E: 3 spec files** (auth, customers, documents) against a running app + seeded DB. The Playwright harness (4 browser/device projects incl. mobile) is in place; coverage breadth is the main gap (see §6).

This is enough confidence to deploy the **service/business-logic layer** with high assurance. The **end-to-end UI flows** are partially covered; §6 lists exactly what to add for full deploy-with-confidence.

---

## 2. How to run

```bash
pnpm test                 # vitest watch (unit + integration)
pnpm exec vitest run      # vitest once (CI mode)
pnpm exec vitest run tests/unit/payments.service.test.ts   # a single file
pnpm test:e2e             # Playwright (auto-starts `pnpm dev`)
pnpm typecheck            # tsc --noEmit
pnpm build                # production build
```

**Environment:** `vitest.config.ts` loads `.env` into `process.env` (because `lib/env.ts` validates at import). The unit suite needs the env vars to *parse*, not a live DB — services are tested with mocked repositories. `server-only` is aliased to a test stub so server modules import cleanly in Node.

**E2E preconditions:** a running app and a seeded database with the demo users (§4). Either let Playwright start `pnpm dev`, or point at an external server with `PLAYWRIGHT_BASE_URL=http://host:port`.

---

## 3. Test architecture

```
tests/
  unit/          # service business logic (mocked repos), money, numbering, permissions matrix
  integration/   # cron route auth + idempotency
  e2e/           # Playwright specs + shared helpers (login/logout)
  stubs/         # server-only stub for the Node test env
```

- **Unit** — each `*.service.test.ts` exercises business rules, permission enforcement, and edge cases with the repository layer mocked. `permissions.test.ts` asserts the **full role × permission matrix** (adding a permission without updating it fails CI). `money.test.ts` covers paisa arithmetic/rounding/formatting; `numbering.test.ts` covers sequence-backed numbers.
- **Integration** — `cron-routes.test.ts` (24 tests) covers cron auth (401 without bearer, 401 when secret unset, 200 with bearer) and idempotency expectations.
- **E2E** — drive real UI with role/label locators (`getByRole`/`getByLabel`) rather than brittle `#id`s; credentials come from `SEED_ADMIN_*`.

---

## 4. Seed data for testing

`pnpm seed` creates the ADMIN (always) and, when `NODE_ENV !== "production"`, **one demo user per role** plus a demo dataset (customer, lead, quotation, booking, payment, task):

| Role | Email | Password |
|------|-------|----------|
| ADMIN | `SEED_ADMIN_EMAIL` | `SEED_ADMIN_PASSWORD` |
| AGENT | `agent@safarcrm.local` | `DemoAgent!2026` |
| MANAGER | `manager@safarcrm.local` | `DemoManager!2026` |
| ACCOUNTANT | `accountant@safarcrm.local` | `DemoAccountant!2026` |

> The MANAGER/ACCOUNTANT demo users were added in this pass specifically to enable RBAC E2E and manual role testing. Demo passwords are for **non-production only**. The demo agent owns the demo customer/lead/booking, so AGENT-ownership flows (and the dashboard scoping) can be exercised end-to-end.

---

## 5. What is covered (by layer)

| Area | Unit/Integration | E2E |
|------|------------------|-----|
| Auth (login/logout/invalid/persistence/redirect) | — | ✅ `auth.spec.ts` |
| Permissions matrix (all roles) | ✅ `permissions.test.ts` | partial |
| Customers (CRUD, ownership, import, soft delete) | ✅ `customers.service.test.ts` | ✅ `customers.spec.ts` |
| Leads (transitions, convert, assign, lost) | ✅ `leads.service.test.ts` (30) | gap |
| Tasks (create/complete/reassign, reminders) | ✅ `tasks.service.test.ts` | gap |
| Bookings (status, cancel, balance) | ✅ `bookings.service.test.ts` | gap |
| Payments (record/partial/full/refund/overpayment/race) | ✅ `payments.service.test.ts` (17) | gap |
| Quotations (draft/send/accept/expire, numbering) | ✅ `quotations.service.test.ts` | gap |
| Invoices (issue/paid/void/number) | ✅ `invoices.service.test.ts` | gap |
| Documents (upload/download/permission/expiry) | ✅ `documents.service.test.ts` | ✅ `documents.spec.ts` |
| Reports (revenue/leads/agents/payments/scoping) | ✅ `reports.service.test.ts` (28) | gap |
| Dashboard ownership scoping | ✅ `dashboard-scope.test.ts` (added this pass) | gap |
| Cron (auth + idempotency) | ✅ `cron-routes.test.ts` | n/a |
| Money / numbering | ✅ `money`, `numbering` | n/a |

See TEST_MATRIX.md for the per-flow breakdown the QA brief asked for.

---

## 6. Known gaps & recommended additions (priority order)

E2E breadth is the gap. None of the missing specs were stubbed-in unrun, by design — committing E2E specs that haven't been executed against a live DB would risk exactly the flakiness the brief warns against. To close the gap, add (each against the seeded demo data):

1. **RBAC E2E** (`rbac.spec.ts`) — log in as AGENT/MANAGER/ACCOUNTANT and assert: hidden UI actions, 403/redirect on forbidden server actions, AGENT sees only own records, ACCOUNTANT blocked from non-financial reports, MANAGER cannot open user management. (Service-level RBAC is already unit-tested; this verifies the UI + wiring.)
2. **Leads E2E** — create → assign → status transitions → convert to customer/booking → lost flow → interaction logging. Kanban drag/drop is the trickiest; assert status via the API/list if DnD proves flaky.
3. **Payments E2E** — record partial, record full, attempt overpayment (expect rejection), refund; assert `balancePaisa`.
4. **Bookings E2E** — create, status transitions, cancel (reason required), travel-date validation.
5. **Quotations E2E** — draft → send (PDF + outbox row) → accept/expire; assert `QT/SQ` numbering.
6. **Mobile E2E** — the `mobile` Playwright project (iPhone 14) already runs all specs; add explicit assertions at 390/430/768px: tables collapse to cards, dialogs/drawers open, no horizontal overflow, touch targets ≥ 44px.
7. **Cron E2E/integration** — extend `cron-routes` with a DB-backed idempotency test (run a sweep twice, assert one task/email created) using a test DB branch.

### Flaky-test guidance
- Use `getByRole`/`getByLabel` (already the convention) — never positional/CSS selectors.
- Prefer asserting **state** (URL, visible heading, row presence) over timing; avoid fixed `waitForTimeout`.
- For drag/drop and toasts, assert the resulting persisted state, not the animation.
- E2E runs with `retries: 2` in CI and `trace: on-first-retry` — investigate any test that only passes on retry; don't paper over it.
- Keep E2E data isolated: run against a disposable Neon branch seeded fresh, so order-independence holds and `fullyParallel` stays safe.

---

## 7. CI recommendation

```
pnpm install
pnpm typecheck
pnpm exec vitest run
pnpm build
# E2E against a seeded Neon preview branch:
pnpm seed && pnpm test:e2e
```
Gate merges on unit/integration + typecheck + build (fast, deterministic). Run E2E on a seeded preview branch per PR.
