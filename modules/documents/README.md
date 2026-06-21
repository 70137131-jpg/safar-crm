# Documents module

Secure storage + management of customer/booking files (passports, visas,
tickets, vouchers, invoices, etc.) on **Cloudflare R2** (private bucket, no
public read). Layering is strict: UI → `documents.actions` → `documents.service`
→ `documents.repository` → Prisma. R2 access is isolated in `lib/storage/r2.ts`
(`server-only`). Every mutation is wrapped in `withAudit`; downloads are gated
and audited.

## Upload flow (presigned PUT — ARCHITECTURE.md §8)

1. Browser computes the file's SHA-256, then `createUploadUrlAction` → service
   validates type/size/ownership and returns a 5-min presigned PUT URL (signed
   with `x-amz-checksum-sha256`) + a content-addressed key
   `documents/{customerId}/{uuid}/{file}`.
2. Browser PUTs the bytes **directly to R2** (never through our server) sending
   the `x-amz-checksum-sha256` header. **R2 rejects the PUT unless the bytes hash
   to the declared value** — integrity is verified at write time (TASKS.md §1.9).
3. `confirmUploadAction` → service `HEAD`s the object to confirm it landed and
   matches the declared size, then records the `Document` row (the checksum is
   already trustworthy because the object could not have landed otherwise).

> **Deploy requirement:** browser PUTs only succeed if the R2 bucket CORS policy
> allows the `x-amz-checksum-sha256` request header (in addition to
> `Content-Type`). Update the bucket CORS `AllowedHeaders` before relying on
> checksum-verified uploads in any environment.

## Download flow

`GET /api/documents/[id]/download` → resolve session → `documents:view` check +
audit (grants **and** denials) → 302 to a fresh 5-min signed URL. `?disposition=inline`
serves a preview. Signed URLs are never embedded in email (ARCHITECTURE.md §2.7).

## Expiry cron

`GET /api/cron/sweep-document-expiry` (daily, `CRON_SECRET`-gated, scheduled in
`vercel.json`). Passports expiring ≤ 45 days and visas ≤ 30 days create follow-up
Tasks. Idempotent: passports via the `Task` partial-unique index
(`customerId` where `type=PASSPORT_EXPIRY AND status=OPEN`); visas via a
deterministic title per customer.

## Deliberate divergences from the original module spec

These follow the **binding** `ARCHITECTURE.md` / `prisma/schema.prisma`
("follow existing architecture exactly") rather than the generic spec text:

| Spec said | Implemented (existing architecture) | Why |
|---|---|---|
| `DocumentType` incl. `HOTEL_VOUCHER`, `INSURANCE` | Schema enum `PASSPORT, VISA, TICKET, INVOICE, VOUCHER, OTHER` (UI labels `VOUCHER` as "Hotel Voucher") | Enum is fixed in the post-review Prisma schema; adding members needs a migration. Insurance files currently file under `OTHER`. |
| Fields `mimeType`, `fileSize` | `contentType`, `sizeBytes`, plus required `checksumSha256` | Matches the schema (ARCHITECTURE.md §7). |
| Permissions `documents:create` / `documents:update` | `documents:upload` (existing) + added `documents:update` | Catalog already used `:upload`; `:update` was added via the documented 3-step process. |
| "Soft delete DB" on delete | **Hard delete** of the row + R2 object | `Document` has no `deletedAt`; soft delete is reserved for Customer/Lead/Booking (CLAUDE.md). The audit trail preserves the record. |

**Follow-ups if the product owner wants the spec verbatim:** a migration adding
`INSURANCE` / renaming `VOUCHER→HOTEL_VOUCHER`; a `Task.sourceKey` column for
DB-enforced visa-expiry idempotency; and (when the permissions matrix test from
TASKS §0.6 lands) an assertion row for `documents:update`.

## Not wired yet

The `DocumentsPanel` is reusable and already mounted on the **customer** detail
"Documents" tab. It accepts `bookingId` + `categorized` for a **booking** detail
tab, but no booking detail page exists yet (Bookings module is still a stub) —
drop `<DocumentsPanel bookingId={...} categorized canUpload canDelete />` in once
that page is built.
