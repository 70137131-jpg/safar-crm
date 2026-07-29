import { describe, expect, it } from "vitest";
import {
  calculateLeadScore,
  classifyReportQuestion,
  forecastLinearSeries,
  rankPackages,
  reviewQuote,
} from "@/modules/ai-enhancements/ai-enhancements.logic";

describe("AI enhancement deterministic logic", () => {
  it("explains and prioritizes a hot lead without model arithmetic", () => {
    const result = calculateLeadScore({
      status: "NEGOTIATING",
      hasBudget: true,
      hasDestination: true,
      travelDate: new Date("2026-08-15T00:00:00.000Z"),
      lastInteractionAt: new Date("2026-07-28T00:00:00.000Z"),
      openTaskCount: 1,
      overdueTaskCount: 0,
      quotationStatuses: ["SENT"],
      now: new Date("2026-07-29T00:00:00.000Z"),
    });

    expect(result.score).toBe(100);
    expect(result.priority).toBe("URGENT");
    expect(result.nextAction).toContain("sent quotation");
    expect(result.reasons).toContain("Travel is planned within 30 days.");
  });

  it("penalizes stale leads and recommends overdue-task recovery", () => {
    const result = calculateLeadScore({
      status: "CONTACTED",
      hasBudget: false,
      hasDestination: true,
      travelDate: null,
      lastInteractionAt: new Date("2026-06-01T00:00:00.000Z"),
      openTaskCount: 2,
      overdueTaskCount: 2,
      quotationStatuses: [],
      now: new Date("2026-07-29T00:00:00.000Z"),
    });

    expect(result.score).toBeLessThan(35);
    expect(result.priority).toBe("LOW");
    expect(result.nextAction).toContain("overdue");
  });

  it("ranks verified packages by destination and budget fit", () => {
    const result = rankPackages({ destination: "Dubai", budgetPaisa: 500_000n }, [
      {
        id: "match",
        title: "Dubai Saver",
        destination: "Dubai",
        durationDays: 5,
        pricePaisa: 450_000n,
        hotel: "City Hotel",
        included: ["Hotel"],
      },
      {
        id: "other",
        title: "Umrah",
        destination: "Makkah",
        durationDays: 10,
        pricePaisa: 700_000n,
        hotel: null,
        included: [],
      },
    ]);

    expect(result[0]?.id).toBe("match");
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
  });

  it("blocks inconsistent quotations before sending", () => {
    const result = reviewQuote({
      status: "DRAFT",
      validTill: new Date("2026-07-01T00:00:00.000Z"),
      subtotalPaisa: 100_000n,
      taxPaisa: 10_000n,
      discountPaisa: 0n,
      totalPaisa: 90_000n,
      items: [
        {
          description: "Hotel",
          quantity: 1,
          unitPricePaisa: 100_000n,
          linePaisa: 100_000n,
        },
      ],
      now: new Date("2026-07-29T00:00:00.000Z"),
    });

    expect(result.readyToSend).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Subtotal, tax, discount, and total are inconsistent.",
        "The quotation validity date has passed.",
      ]),
    );
  });

  it("forecasts with transparent regression and identifies report intents", () => {
    const result = forecastLinearSeries([
      { month: "2026-01", value: 100 },
      { month: "2026-02", value: 120 },
      { month: "2026-03", value: 140 },
    ]);

    expect(result.forecast).toEqual([
      { month: "2026-04", value: 160 },
      { month: "2026-05", value: 180 },
      { month: "2026-06", value: 200 },
    ]);
    expect(classifyReportQuestion("Which destination converted best?")).toBe("destination");
    expect(classifyReportQuestion("Show unpaid balances")).toBe("payments");
    expect(classifyReportQuestion("How are overdue follow-ups trending?")).toBe("tasks");
  });
});
