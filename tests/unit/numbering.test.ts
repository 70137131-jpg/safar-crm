import { describe, it, expect, vi } from "vitest";

// numbering.ts imports @/lib/db at module load; stub it (we drive it with a fake tx).
vi.mock("@/lib/db", () => ({ db: {} }));

const { nextDocumentNumber } = await import("@/lib/numbering/numbering");

/**
 * Fake transaction client whose `$queryRaw` returns a fixed nextval, so the
 * format/padding/year logic is tested deterministically without Postgres.
 */
function txReturning(nextval: bigint) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ nextval }]),
  } as never;
}

describe("nextDocumentNumber", () => {
  const date = new Date("2026-06-15T00:00:00Z");

  it("formats a booking number as BK-<year>-<6 digit pad>", async () => {
    expect(await nextDocumentNumber("booking", txReturning(42n), date)).toBe("BK-2026-000042");
  });

  it("formats a quotation number as QT-<year>-<6 digit pad>", async () => {
    expect(await nextDocumentNumber("quote", txReturning(1n), date)).toBe("QT-2026-000001");
  });

  it("formats an invoice number as INV-<year>-<6 digit pad>", async () => {
    expect(await nextDocumentNumber("invoice", txReturning(7n), date)).toBe("INV-2026-000007");
  });

  it("does not truncate numbers larger than 6 digits", async () => {
    expect(await nextDocumentNumber("quote", txReturning(1234567n), date)).toBe("QT-2026-1234567");
  });

  it("takes the year segment from the supplied date", async () => {
    expect(await nextDocumentNumber("quote", txReturning(5n), new Date("2027-01-01T00:00:00Z"))).toBe(
      "QT-2027-000005",
    );
  });

  it("queries the correct sequence per kind", async () => {
    const tx = txReturning(3n);
    await nextDocumentNumber("invoice", tx, date);
    const sql = String((tx as { $queryRaw: { mock: { calls: unknown[][] } } }).$queryRaw.mock.calls[0]![0]);
    expect(sql).toContain("invoice_number_seq");
  });

  it("yields strictly increasing numbers for sequential calls", async () => {
    let n = 0n;
    const tx = { $queryRaw: vi.fn(async () => [{ nextval: ++n }]) } as never;
    const a = await nextDocumentNumber("quote", tx, date);
    const b = await nextDocumentNumber("quote", tx, date);
    expect(a).toBe("QT-2026-000001");
    expect(b).toBe("QT-2026-000002");
    expect(a).not.toBe(b);
  });
});
