# PERFORMANCE.md — Safar CRM

**Audit date:** 2026-06-20
**Scope:** Dashboard, Customers, Leads, Tasks, Bookings, Payments, Quotations, Documents, Reports.
**Principle followed:** optimize only where a real cost exists. No Redis / PostHog / Kafka / external caches added (explicitly out of scope, and unwarranted at single-agency scale).

---

## 1. Verdict

Performance is solid for the target workload (one travel agency: thousands — not millions — of rows). Queries are indexed, list endpoints paginate and project with `select`, and the dashboard streams via `<Suspense>`. The fixes in this pass (dashboard ownership scoping) added **no** query cost because `getSession` is request-memoized. The few items worth knowing are listed as **scale notes** (act only if data grows large) plus one **reliability fix worth making** (email outbox holds a DB transaction across a network call).

| Concern | Finding |
|---------|---------|
| N+1 queries | None found — relations use nested `select`/`include` (single JOINed query) |
| Over-fetching | Lists use explicit `select` projections; details fetch what they render |
| Expensive includes | None; no unbounded nested `include` trees |
| Duplicate queries | `getSession` is `cache()`-memoized; dashboard's per-widget `requireUser()` is deduped |
| Pagination | Server-side `skip`/`take` + parallel `count` everywhere |
| Suspense / streaming | Dashboard widgets each in their own `<Suspense>`; route-level `loading.tsx` added |
| Table performance | TanStack Table, server-paginated; mobile collapses to cards |
| Bundles | Heavy libs (`recharts`, `@react-pdf/renderer`) are appropriately isolated |

---

## 2. Query patterns (verified)

**Lists (`*.repository.ts`)** — representative: `customers.repository.findMany`:
- Explicit `select` (`CUSTOMER_LIST_SELECT`) — only the columns the table renders; no `SELECT *`.
- `Promise.all([findMany, count])` — page + total in parallel.
- `skip`/`take` pagination; `orderBy` on indexed columns.
- The agent relation is fetched via nested `select` (`assignedAgent: { select: { id, name } }`) — a **JOIN, not N+1**.

**Reads through services** — payment balance recomputes `SUM(amountPaisa)` via `repo.sumCollected` (a single aggregate), not by loading all rows into JS.

**Reports (`report.service.ts`)** — date range is **Zod-bounded to ≤ 1 year**, AGENT is auto-scoped to own data, ACCOUNTANT to financial reports. Aggregations run in the DB. Bounded inputs keep worst-case cost predictable.

**No N+1 found** across the modules reviewed. The common N+1 trap (looping queries per row) does not appear; related data is always pulled in the same query via `select`/`include`.

## 3. Dashboard

- Seven widgets, each wrapped in its own `<Suspense>` with a skeleton fallback → the shell paints immediately and widgets stream in independently (no single slow query blocks the page).
- Each widget issues 1–2 small aggregate/`findMany(take: 8)` queries, now with an ownership `where` filter for AGENT (added this pass). The filter is **index-supported** (`assignedAgentId`, `customer.assignedAgentId`).
- The added per-widget `requireUser()` does **not** add DB round-trips: `getSession` in `lib/auth/session.ts` is wrapped in React `cache()`, so all widgets in one render share a single session lookup.
- A route-level `app/(app)/loading.tsx` was added for instant navigation feedback between app segments.

## 4. Scale notes (act only if volume grows)

1. **Search uses leading-wildcard ILIKE.** `customers.repository.search` uses `contains`/`endsWith` (`%query%`), which **cannot** use the btree `name/email/phone` indexes → sequential scan. Fine at single-agency scale; if the customer table reaches tens of thousands of rows and search feels slow, add a `pg_trgm` GIN index:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX customer_name_trgm ON "Customer" USING GIN (name gin_trgm_ops);
   ```
2. **`AuditLog` growth** — already planned for monthly partitioning past ~5M rows (BRIN index is in place; no action now).
3. **Deep pagination** — `OFFSET`-based paging degrades on very large offsets. Not a concern at expected page counts; switch to keyset pagination only if needed.

## 5. Reliability fix worth making — email outbox

**File:** `lib/email/outbox.ts`
`drainEmailOutbox` opens `db.$transaction` and calls `resend.emails.send()` (a network request) **inside** it, holding the row lock and a pooled DB connection for the duration of the HTTP call. On Neon pooled connections this can exhaust the small connection budget under load, and a slow Resend response ties up a connection.

Recommendation (no architecture change): claim+mark the row in a short transaction, send **outside** the transaction, then update status in a second short transaction. Delivery stays at-least-once and idempotent; connections are released during the network call. Low urgency at current volume (batch size 25, every 5 min) but worth doing before heavy email use.

> Note: the current design is at-least-once — if `send` succeeds but the commit fails, the email re-sends on the next drain. Acceptable for transactional mail; documented so it isn't mistaken for exactly-once.

## 6. Frontend / rendering

- **Server components by default**; client components (`"use client"`) are used for forms (React Hook Form), tables, and dialogs — the interactive surface only.
- **No obvious over-render risk**: list state (sort/page/search) lives in client list components driven by server actions; charts (`recharts`) render from already-aggregated, serialized data.
- **Hydration**: money is serialized to string before crossing the server→client boundary (BigInt can't hydrate), and dates are formatted with a fixed `Asia/Karachi` timezone in `Intl.DateTimeFormat` — avoiding server/client locale-mismatch hydration warnings.
- **Bundles**: `@react-pdf/renderer` (large) is used only in server-side PDF generation (`quotation-pdf.tsx`), not shipped to the browser. `recharts` loads on report/dashboard pages where charts are actually used. Turbopack code-splits per route. No action needed; revisit with `@next/bundle-analyzer` only if a route's first-load JS becomes a problem.

## 7. Connection pooling

- `DATABASE_URL` uses Neon pooled (`pgbouncer=true&connection_limit=1`) for the serverless runtime; `DIRECT_DATABASE_URL` (non-pooled) is used for migrations/scripts. Correct split. The Prisma client is a singleton (`lib/db.ts`) to avoid connection storms on hot reload.

## 8. Summary of changes made in this pass

- Dashboard widgets scoped per role (security fix) — **no added query cost** (index-backed filters + memoized session).
- `app/(app)/loading.tsx` added (perceived performance on navigation).
- No premature optimization applied; scale items above are intentionally deferred until data justifies them.
