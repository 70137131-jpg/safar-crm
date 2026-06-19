# DATABASE_AUDIT.md — Safar CRM

**Audit date:** 2026-06-20
**Source:** `prisma/schema.prisma` + `prisma/migrations/{20260617000000_init, 20260618000000_settings_users_admin, 20260619000000_email_outbox}/migration.sql`
**DB:** PostgreSQL (Neon), Prisma 6, `citext` extension.

---

## 1. Verdict

The schema is production-grade. Money is `BigInt` paisa everywhere (no floats), optimistic-concurrency `version` columns exist on mutable aggregates, soft delete is partial-unique-index-aware, and an extensive set of CHECK constraints, sequences, a totals-lock trigger, and a BRIN index are **all present in the init migration** (not just in schema comments). One **action-required** item (the AuditLog append-only role) and a few minor index/FK gaps are listed below.

| Area | Result |
|------|--------|
| Money as `bigint` paisa, no float | ✅ verified (all `*Paisa` are `BigInt`; no float/decimal money columns) |
| OCC / `version` columns | ✅ Customer, Lead, Booking, Quotation |
| Soft delete + partial unique indexes | ✅ Customer/Lead/Booking + active-only unique indexes |
| CHECK constraints | ✅ extensive (amounts ≥ 0, state consistency, polymorphic parents) |
| Sequences for numbering | ✅ `booking_number_seq`, `quote_number_seq`, `invoice_number_seq` |
| Enums | ✅ 16 enums, no free-text status columns |
| FK indexes | ⚠️ all covered **except** `User.deactivatedById` (minor) |
| Audit immutability | ⚠️ depends on `crm_app` role — **action required** |

---

## 2. Money & numeric safety

- Every monetary column is `BigInt` paisa: `Lead.budgetPaisa`, `Booking.totalPricePaisa`, `Payment.amountPaisa` (signed; refunds negative), `Quotation.{subtotal,tax,discount,total}Paisa`, `QuotationItem.{unitPrice,line}Paisa`, `Invoice.amountPaisa`, `Package.pricePaisa`. **No `Float`/`Decimal`/`number` money columns exist.**
- Arithmetic is centralized in `lib/money/paisa.ts`; `BigInt` is stringified before entering JSON/audit (`redactPII`) and the wire (`serialize`).
- Non-negativity / signing enforced at the DB:
  - `booking_total_nonneg`, `invoice_amount_nonneg`, `quotation_totals_nonneg`, `lead_budget_nonneg`, `package_price_nonneg`.
  - `quotation_item_amounts`: `quantity > 0 AND unitPricePaisa >= 0 AND linePaisa = quantity * unitPricePaisa` (line totals can't drift).
- App-layer (display-only) `Number()`/`.toFixed()` appears in report **chart axis/percent formatters** only — never in storage or money math.

## 3. Constraints inventory (all present in migration SQL)

**CHECK constraints**
- `Customer`: `customer_nationality_iso` (`^[A-Z]{2}$`), `customer_passport_format` (`^[A-Z0-9]{6,12}$`).
- `Lead`: `lead_pax_positive`, `lead_budget_nonneg`, `lead_lost_reason_when_lost` (LOST ⇒ `lostReason` set).
- `Interaction`: `interaction_exactly_one_parent` (exactly one of lead/customer), `interaction_body_cap` (≤ 20 000 chars).
- `Task`: `task_has_parent` (≥ 1 of lead/customer/booking), `task_done_consistency` (DONE ⇔ `doneAt`).
- `Booking`: `booking_total_nonneg`, `booking_cancel_consistency` (CANCELLED ⇔ `cancelledAt`+`cancelReason`).
- `Payment`: `payment_voided_consistency` (VOIDED ⇔ `voidedAt`).
- `Quotation`: `quotation_has_target`, `quotation_totals_nonneg`, `quotation_number_when_sent` (DRAFT ⇔ `quoteNumber IS NULL`).
- `Document`: `document_has_parent`, `document_denorm_customer` (booking ⇒ customer set), `document_size_nonneg`, `document_checksum_format` (`^[a-f0-9]{64}$`).
- `Settings`: `settings_singleton` (`id = 'singleton'`).
- `Package`: `package_duration_pos`, `package_price_nonneg`.

**Partial unique indexes (soft-delete & dedup aware)**
- `customer_email_active_uq` / `customer_phone_active_uq` — uniqueness only `WHERE deletedAt IS NULL` (so a deleted record doesn't block re-creation).
- `task_passport_expiry_open_uq` (per customer) / `task_payment_due_open_uq` (per booking) — at most one OPEN reminder of each type ⇒ **cron idempotency at the DB level**.
- `payment_idempotency_uq` — unique `idempotencyKey WHERE NOT NULL` ⇒ safe payment retries.

**Trigger** — `quotation_lock_totals` (BEFORE UPDATE): once a quote leaves DRAFT, the four total columns are immutable (raises if changed). Financial figures on a sent/accepted quote cannot be silently altered.

## 4. Numbering sequences (safe)

`Booking.bookingNumber`, `Quotation.quoteNumber`, `Invoice.invoiceNumber` are driven by Postgres sequences (`booking_number_seq`, `quote_number_seq`, `invoice_number_seq`) via `lib/numbering`, **not** `MAX()+1` — so concurrent inserts cannot collide or skip-then-duplicate. Each target column is also `@unique` (belt-and-braces). `quoteNumber` is `NULL` until the quote leaves DRAFT, guarded by `quotation_number_when_sent`. (Note: sequences are gap-tolerant by design — a rolled-back transaction consumes a value; this is correct and expected for invoice/quote numbering.)

## 5. Foreign keys, `onDelete`, and indexes

- **Referential actions:** business relations use `ON DELETE RESTRICT` (no accidental cascade of customers/leads/bookings); `Session`/`Account` and `QuotationItem` use `CASCADE` (children of their parent); `AuditLog.actorId` uses `SET NULL` (preserve the trail when a user is removed). All appropriate.
- **FK index coverage:** every foreign key has a supporting index **except `User.deactivatedById`** (self-relation). Low impact (tiny cardinality, rare lookups) but trivial to add: `@@index([deactivatedById])`.
- **Composite indexes** match the real access paths: `Lead(assignedAgentId, status, updatedAt desc)` (agent kanban), `Task(assignedToId, status, dueDate)` (my-open-tasks), `Booking(customerId, status)`, `Interaction(leadId/customerId, occurredAt desc)`, `AuditLog(entity, entityId, createdAt desc)`.
- **`Payment.voidedById` is a bare column, not a FK** — it has no `@relation`/constraint, so a void's actor id is not referentially enforced. Minor integrity gap; consider adding a `User` relation (or document as intentional denormalization).

## 6. Audit immutability — ACTION REQUIRED

`AuditLog` is designed append-only:
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM crm_app;
    GRANT INSERT, SELECT ON "AuditLog" TO crm_app;
  END IF;
END $$;
```
**The protection only activates if a `crm_app` role exists and the app connects as it.** On default Neon (app connects as owner) the block is skipped and the audit log is mutable. **Fix before go-live** by creating `crm_app`, connecting runtime as it, and re-applying the grant — see RUNBOOK.md and SECURITY.md §6. `actorId` is nullable so cron/system jobs can write audit rows.

## 7. Time, types, text

- All temporal columns are `@db.Timestamptz(6)`; calendar-only columns (`passportExpiry`, `dob`, `travelDate`, `validTill`) are `@db.Date`. No naive timestamps.
- `email` columns are `citext` (case-insensitive) with the `citext` extension declared.
- IDs are native `uuid` generated app-side (`randomUUID`) so Better Auth's `Session`/`Account`/`Verification` rows satisfy the `uuid` type.
- `AuditLog.createdAt` uses a **BRIN** index (`audit_log_created_brin`) — cheap and correct for an append-only, time-ordered table.

## 8. Recommendations (prioritized)

1. **[Required]** Create and use the `crm_app` role so AuditLog is truly append-only (§6).
2. **[Nice]** Add `@@index([deactivatedById])` on `User`.
3. **[Nice]** Add a real FK for `Payment.voidedById → User` (or document the denormalization).
4. **[Scale]** Search uses `contains`/`endsWith` (leading-wildcard ILIKE) which cannot use the btree `name/email/phone` indexes — fine for a single agency, but add a `pg_trgm` GIN index if customer volume grows large (see PERFORMANCE.md §4).
5. **[Scale]** Plan `AuditLog` monthly partitioning past ~5M rows (already noted in the schema).

## 9. Migration hygiene

- Three ordered migrations with a `migration_lock.toml` (provider locked to postgresql).
- Raw SQL (constraints/indexes/sequences/trigger/grants) lives **inside** the tracked migrations — reproducible on a fresh Neon branch via `prisma migrate deploy`.
- Idempotent guards (`CREATE SEQUENCE IF NOT EXISTS`, the `pg_roles` `DO` block) make re-runs safe.
