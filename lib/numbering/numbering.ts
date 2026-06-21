import type { Prisma } from "@prisma/client";
import type { db } from "@/lib/db";

/**
 * Human-readable document numbers, minted from Postgres sequences.
 *
 * Format: `<PREFIX>-<YEAR>-<NNNNNN>` (e.g. `BK-2026-000042`).
 *
 * The sequences (`booking_number_seq`, `quote_number_seq`,
 * `invoice_number_seq`) are created in the init migration's raw-SQL layer.
 * `nextval` is atomic and gap-tolerant under concurrency — two callers in
 * parallel transactions always receive distinct values — which is exactly
 * what the "50 concurrent SENDs → 50 unique numbers" acceptance test needs.
 *
 * Must be called inside the same transaction as the row insert so the number
 * and the row commit (or roll back) together.
 *
 * Sequence names are compile-time constants below — never interpolated from
 * user input — so the tagged-template queries carry no injection surface.
 */

type TxClient = typeof db | Prisma.TransactionClient;

export type DocumentNumberKind = "booking" | "quote" | "invoice";

const PREFIX: Record<DocumentNumberKind, string> = {
  booking: "BK",
  quote: "QT",
  invoice: "INV",
};

async function nextSeqValue(kind: DocumentNumberKind, tx: TxClient): Promise<bigint> {
  // Explicit per-sequence queries (no dynamic identifier interpolation).
  let rows: { nextval: bigint }[];
  switch (kind) {
    case "booking":
      rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('booking_number_seq') AS nextval`;
      break;
    case "quote":
      rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('quote_number_seq') AS nextval`;
      break;
    case "invoice":
      rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_number_seq') AS nextval`;
      break;
  }
  return rows[0]!.nextval;
}

/**
 * Mint the next document number for `kind`. `date` selects the year segment
 * (defaults to now); pass the travel/issue date when that is more meaningful.
 */
export async function nextDocumentNumber(
  kind: DocumentNumberKind,
  tx: TxClient,
  date: Date = new Date(),
): Promise<string> {
  const n = await nextSeqValue(kind, tx);
  return `${PREFIX[kind]}-${date.getFullYear()}-${n.toString().padStart(6, "0")}`;
}
