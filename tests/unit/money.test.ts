import { describe, it, expect } from "vitest";
import {
  ZERO,
  add,
  sub,
  mul,
  mulBps,
  fromPKR,
  toPKR,
  formatPKR,
  serialize,
  deserialize,
} from "@/lib/money/paisa";

/**
 * Money correctness — paisa is `bigint`, never float. These tests pin the
 * parsing, formatting, rounding/truncation, and (de)serialisation contracts.
 */

describe("fromPKR", () => {
  it("parses whole rupees to paisa", () => {
    expect(fromPKR("1234")).toBe(123400n);
    expect(fromPKR("0")).toBe(ZERO);
  });
  it("parses one and two decimal places", () => {
    expect(fromPKR("1234.5")).toBe(123450n);
    expect(fromPKR("1234.56")).toBe(123456n);
  });
  it("handles negatives", () => {
    expect(fromPKR("-5.25")).toBe(-525n);
  });
  it("does not lose precision on large amounts (no float drift)", () => {
    expect(fromPKR("99999999999.99")).toBe(9999999999999n);
  });
  it("rejects more than two decimals and junk", () => {
    expect(() => fromPKR("1.234")).toThrow();
    expect(() => fromPKR("abc")).toThrow();
    expect(() => fromPKR("1,234")).toThrow();
  });
});

describe("toPKR / round-trip", () => {
  it("formats paisa back to a decimal string", () => {
    expect(toPKR(123456n)).toBe("1234.56");
    expect(toPKR(5n)).toBe("0.05");
    expect(toPKR(-525n)).toBe("-5.25");
    expect(toPKR(0n)).toBe("0.00");
  });
  it("round-trips fromPKR ∘ toPKR", () => {
    for (const v of [0n, 1n, 99n, 100n, 123456n, -525n, 9999999999999n]) {
      expect(fromPKR(toPKR(v))).toBe(v);
    }
  });
});

describe("formatPKR", () => {
  it("groups thousands with Rs prefix", () => {
    expect(formatPKR(123456789n)).toBe("Rs 1,234,567.89");
    expect(formatPKR(0n)).toBe("Rs 0.00");
    expect(formatPKR(100000n)).toBe("Rs 1,000.00");
  });
  it("formats negatives", () => {
    expect(formatPKR(-123456n)).toBe("-Rs 1,234.56");
  });
});

describe("add / sub", () => {
  it("adds and subtracts exactly", () => {
    expect(add(100n, 250n)).toBe(350n);
    expect(sub(100n, 250n)).toBe(-150n);
  });
});

describe("mul (decimal factor)", () => {
  it("applies a tax-style rate", () => {
    expect(mul(10000n, 0.15)).toBe(1500n); // 15% of Rs 100 = Rs 15
  });
  it("truncates toward zero on fractional paisa", () => {
    // (100 * 333000) / 1_000_000 = 33.3 → 33n
    expect(mul(100n, 0.333)).toBe(33n);
  });
  it("rejects a non-finite factor", () => {
    expect(() => mul(100n, Infinity)).toThrow();
    expect(() => mul(100n, NaN)).toThrow();
  });
});

describe("mulBps (basis points)", () => {
  it("computes 15% as 1500 bps", () => {
    expect(mulBps(10000n, 1500)).toBe(1500n);
  });
  it("truncates fractional paisa", () => {
    // (333 * 1500) / 10000 = 49.95 → 49n
    expect(mulBps(333n, 1500)).toBe(49n);
  });
  it("rejects a non-integer bps", () => {
    expect(() => mulBps(100n, 12.5)).toThrow();
  });
});

describe("serialize / deserialize", () => {
  it("round-trips through a JSON-safe string", () => {
    const v = 9999999999999n;
    expect(deserialize(serialize(v))).toBe(v);
    expect(typeof serialize(v)).toBe("string");
  });
});
