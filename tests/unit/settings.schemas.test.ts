import { describe, it, expect } from "vitest";
import {
  updateAgencySchema,
  updateLeadSourcesSchema,
  MAX_LEAD_SOURCES,
  MAX_LEAD_SOURCE_LENGTH,
} from "@/modules/settings/settings.schemas";

/**
 * `taxRegistrationNo` (NTN) is rendered on quotation/invoice PDFs, so a blank
 * submission must normalise to undefined — the service writes null — rather
 * than persisting an empty string that would print as "NTN: ".
 */
describe("updateAgencySchema — taxRegistrationNo", () => {
  const parse = (taxRegistrationNo?: string) =>
    updateAgencySchema.parse({
      agencyName: "Safar Travel",
      taxPercentage: 0,
      ...(taxRegistrationNo === undefined ? {} : { taxRegistrationNo }),
    }).taxRegistrationNo;

  it("keeps a supplied number, trimmed", () => {
    expect(parse("  1234567-8  ")).toBe("1234567-8");
  });

  it("normalises an empty submission to undefined", () => {
    expect(parse("")).toBeUndefined();
    expect(parse("   ")).toBeUndefined();
  });

  it("is optional", () => {
    expect(parse(undefined)).toBeUndefined();
  });

  it("rejects a number longer than 50 characters", () => {
    expect(() => parse("9".repeat(51))).toThrow();
  });
});

/**
 * The lead-source list is the one place in the settings module with real
 * normalisation logic: the server must trim, drop blanks, dedupe
 * case-insensitively, and cap the count regardless of what the client sends.
 */
describe("updateLeadSourcesSchema", () => {
  const parse = (leadSources: unknown[]) =>
    updateLeadSourcesSchema.parse({ leadSources }).leadSources;

  it("trims whitespace and drops blank entries", () => {
    expect(parse(["  Facebook  ", "   ", "", "Referral"])).toEqual([
      "Facebook",
      "Referral",
    ]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(parse(["Facebook", "facebook", "FACEBOOK", "Walk-in"])).toEqual([
      "Facebook",
      "Walk-in",
    ]);
  });

  it("caps the list at MAX_LEAD_SOURCES", () => {
    const many = Array.from({ length: MAX_LEAD_SOURCES + 10 }, (_, i) => `Source ${i}`);
    expect(parse(many)).toHaveLength(MAX_LEAD_SOURCES);
  });

  it("rejects an entry longer than the per-source limit", () => {
    const tooLong = "x".repeat(MAX_LEAD_SOURCE_LENGTH + 1);
    expect(() => updateLeadSourcesSchema.parse({ leadSources: [tooLong] })).toThrow();
  });

  it("accepts an empty list (clearing all sources)", () => {
    expect(parse([])).toEqual([]);
  });
});
