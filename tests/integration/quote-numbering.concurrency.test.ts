import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { nextDocumentNumber } from "@/lib/numbering/numbering";

/**
 * Real-DB concurrency proof for TASKS.md §1.8 / §1.13: the quote-number
 * sequence (`quote_number_seq`) hands out unique, gap-free values under
 * concurrency. This is the exact guarantee that makes "50 concurrent quotation
 * SENDs → 50 unique numbers" safe — `sendQuotation` mints its number via this
 * same `nextDocumentNumber` helper.
 *
 * Unlike the rest of the suite (which mocks the DB), this test needs a reachable
 * Postgres, so it is skipped unless RUN_DB_TESTS=1. Run it with `pnpm test:db`
 * locally, or via the DB-backed CI job (.github/workflows/preview.yml).
 *
 * `nextval` is non-transactional, so we fire the mints directly against the
 * pooled client rather than 50 interactive transactions — that keeps the test
 * robust on a connection-limited pool while still exercising true concurrency.
 */
const RUN_DB_TESTS = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN_DB_TESTS)("quote numbering under concurrency (real DB)", () => {
  it("mints 50 unique, contiguous numbers across concurrent callers", async () => {
    const N = 50;

    const numbers = await Promise.all(
      Array.from({ length: N }, () => nextDocumentNumber("quote", db)),
    );

    // Every number is unique — no duplicates under concurrency.
    expect(new Set(numbers).size).toBe(N);

    // Every number carries the QT-<year> prefix.
    const year = new Date().getFullYear();
    for (const n of numbers) {
      expect(n.startsWith(`QT-${year}-`)).toBe(true);
    }

    // The numeric suffixes form a contiguous run once sorted (gap-free) — the
    // 50 callers are the only consumers during the Promise.all window.
    const suffixes = numbers
      .map((n) => Number(n.split("-").at(-1)))
      .sort((a, b) => a - b);
    for (let i = 1; i < suffixes.length; i++) {
      expect(suffixes[i]).toBe(suffixes[i - 1]! + 1);
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });
});
