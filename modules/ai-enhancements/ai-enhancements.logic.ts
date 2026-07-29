export interface LeadScoreInput {
  status: string;
  hasBudget: boolean;
  hasDestination: boolean;
  travelDate: Date | null;
  lastInteractionAt: Date | null;
  openTaskCount: number;
  overdueTaskCount: number;
  quotationStatuses: string[];
  now?: Date;
}

export interface LeadScoreResult {
  score: number;
  confidence: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  reasons: string[];
  nextAction: string;
}

const STATUS_SCORE: Record<string, number> = {
  NEW: 10,
  CONTACTED: 25,
  QUOTATION_SENT: 45,
  NEGOTIATING: 60,
  BOOKED: 100,
  TRAVELLED: 100,
  LOST: 0,
};

const DAY_MS = 86_400_000;

export function calculateLeadScore(input: LeadScoreInput): LeadScoreResult {
  const now = input.now ?? new Date();
  let score = STATUS_SCORE[input.status] ?? 15;
  const reasons: string[] = [];
  let observedSignals = 1;

  if (input.hasBudget) {
    score += 5;
    observedSignals++;
    reasons.push("A customer budget is recorded.");
  }
  if (input.hasDestination) {
    score += 5;
    observedSignals++;
    reasons.push("A destination is recorded.");
  }

  const sentQuote = input.quotationStatuses.some((status) => ["SENT", "ACCEPTED"].includes(status));
  if (sentQuote) {
    score += 15;
    observedSignals++;
    reasons.push("A quotation has been sent or accepted.");
  } else if (input.quotationStatuses.includes("DRAFT")) {
    score += 5;
    observedSignals++;
    reasons.push("A quotation draft is already being prepared.");
  }

  if (input.lastInteractionAt) {
    observedSignals++;
    const days = Math.floor((now.getTime() - input.lastInteractionAt.getTime()) / DAY_MS);
    if (days <= 3) {
      score += 15;
      reasons.push("The customer interacted within the last three days.");
    } else if (days <= 7) {
      score += 8;
      reasons.push("The customer interacted within the last week.");
    } else if (days > 21) {
      score -= 12;
      reasons.push("There has been no interaction for more than three weeks.");
    }
  } else {
    score -= 10;
    reasons.push("No interaction has been recorded.");
  }

  if (input.travelDate) {
    observedSignals++;
    const daysToTravel = Math.ceil((input.travelDate.getTime() - now.getTime()) / DAY_MS);
    if (daysToTravel < 0) {
      score -= 20;
      reasons.push("The recorded travel date has passed.");
    } else if (daysToTravel <= 30) {
      score += 15;
      reasons.push("Travel is planned within 30 days.");
    } else if (daysToTravel <= 60) {
      score += 8;
      reasons.push("Travel is planned within 60 days.");
    }
  }

  if (input.overdueTaskCount > 0) {
    score -= Math.min(15, input.overdueTaskCount * 5);
    reasons.push(
      `${input.overdueTaskCount} overdue follow-up task${input.overdueTaskCount === 1 ? "" : "s"} need attention.`,
    );
  } else if (input.openTaskCount > 0) {
    observedSignals++;
    reasons.push("A future follow-up task is scheduled.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const confidence = Math.min(95, 45 + observedSignals * 8);
  const priority = score >= 80 ? "URGENT" : score >= 60 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";

  let nextAction = "Review the lead details and schedule an appropriate follow-up.";
  if (input.overdueTaskCount > 0) {
    nextAction = "Complete or reschedule the overdue follow-up task.";
  } else if (!input.lastInteractionAt) {
    nextAction = "Contact the customer and record the first interaction.";
  } else if (!sentQuote && !input.quotationStatuses.includes("DRAFT")) {
    nextAction = "Confirm requirements and prepare a quotation draft.";
  } else if (sentQuote) {
    nextAction = "Follow up on the sent quotation and record the customer's response.";
  }

  return { score, confidence, priority, reasons, nextAction };
}

export interface PackageCandidate {
  id: string;
  title: string;
  destination: string;
  durationDays: number;
  pricePaisa: bigint;
  hotel: string | null;
  included: string[];
}

export function rankPackages(
  lead: { destination: string | null; budgetPaisa: bigint | null },
  packages: PackageCandidate[],
) {
  const destination = lead.destination?.trim().toLocaleLowerCase() ?? "";
  return packages
    .map((item) => {
      let score = 20;
      const reasons: string[] = [];
      const packageDestination = item.destination.toLocaleLowerCase();
      if (
        destination &&
        (packageDestination.includes(destination) || destination.includes(packageDestination))
      ) {
        score += 50;
        reasons.push("Destination matches the lead.");
      }
      if (lead.budgetPaisa !== null) {
        if (item.pricePaisa <= lead.budgetPaisa) {
          score += 25;
          reasons.push("Package is within the recorded budget.");
        } else {
          const overBy =
            Number(item.pricePaisa - lead.budgetPaisa) / Number(lead.budgetPaisa || 1n);
          score -= Math.min(30, Math.round(overBy * 40));
          reasons.push("Package is above the recorded budget.");
        }
      }
      if (item.hotel) {
        score += 3;
        reasons.push("Hotel information is available.");
      }
      if (item.included.length > 0) score += 2;
      return {
        ...item,
        score: Math.max(0, Math.min(100, score)),
        reasons,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

export interface QuoteReviewInput {
  status: string;
  validTill: Date | null;
  subtotalPaisa: bigint;
  taxPaisa: bigint;
  discountPaisa: bigint;
  totalPaisa: bigint;
  items: Array<{
    description: string;
    quantity: number;
    unitPricePaisa: bigint;
    linePaisa: bigint;
  }>;
  now?: Date;
}

export interface QuoteReviewResult {
  score: number;
  readyToSend: boolean;
  issues: Array<{ severity: "ERROR" | "WARNING" | "INFO"; message: string }>;
}

export function reviewQuote(input: QuoteReviewInput): QuoteReviewResult {
  const issues: QuoteReviewResult["issues"] = [];
  const now = input.now ?? new Date();
  if (input.items.length === 0) {
    issues.push({ severity: "ERROR", message: "The quotation has no line items." });
  }
  const expectedSubtotal = input.items.reduce((sum, item) => sum + item.linePaisa, 0n);
  if (expectedSubtotal !== input.subtotalPaisa) {
    issues.push({ severity: "ERROR", message: "Line items do not match the quotation subtotal." });
  }
  const expectedTotal = input.subtotalPaisa + input.taxPaisa - input.discountPaisa;
  if (expectedTotal !== input.totalPaisa) {
    issues.push({
      severity: "ERROR",
      message: "Subtotal, tax, discount, and total are inconsistent.",
    });
  }
  if (!input.validTill) {
    issues.push({ severity: "WARNING", message: "No quotation validity date is set." });
  } else if (input.validTill < now) {
    issues.push({ severity: "ERROR", message: "The quotation validity date has passed." });
  }
  if (
    input.subtotalPaisa > 0n &&
    Number((input.discountPaisa * 10000n) / input.subtotalPaisa) > 2000
  ) {
    issues.push({ severity: "WARNING", message: "The discount is greater than 20%." });
  }
  const descriptions = input.items.map((item) => item.description.trim().toLocaleLowerCase());
  const duplicate = descriptions.find((value, index) => descriptions.indexOf(value) !== index);
  if (duplicate) {
    issues.push({ severity: "WARNING", message: `Possible duplicate line item: ${duplicate}.` });
  }
  for (const item of input.items) {
    if (item.quantity <= 0 || item.unitPricePaisa < 0n) {
      issues.push({ severity: "ERROR", message: `Invalid amount for ${item.description}.` });
    }
  }
  const hasTravelDetail = descriptions.some((value) =>
    ["flight", "hotel", "visa", "transfer", "ticket", "package"].some((term) =>
      value.includes(term),
    ),
  );
  if (!hasTravelDetail && input.items.length > 0) {
    issues.push({
      severity: "INFO",
      message: "Consider adding clearer travel-service details to the line items.",
    });
  }
  const deduction = issues.reduce(
    (sum, issue) => sum + (issue.severity === "ERROR" ? 25 : issue.severity === "WARNING" ? 10 : 3),
    0,
  );
  return {
    score: Math.max(0, 100 - deduction),
    readyToSend: !issues.some((issue) => issue.severity === "ERROR"),
    issues,
  };
}

export interface ForecastPoint {
  month: string;
  value: number;
}

export function forecastLinearSeries(points: ForecastPoint[], periods = 3) {
  if (points.length === 0) return { forecast: [], anomalies: [], trendPercent: 0 };
  const n = points.length;
  const meanX = (n - 1) / 2;
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / n;
  const denominator = points.reduce((sum, _point, index) => sum + (index - meanX) ** 2, 0);
  const slope =
    denominator === 0
      ? 0
      : points.reduce((sum, point, index) => sum + (index - meanX) * (point.value - meanY), 0) /
        denominator;
  const intercept = meanY - slope * meanX;
  const residuals = points.map((point, index) => point.value - (intercept + slope * index));
  const standardDeviation = Math.sqrt(
    residuals.reduce((sum, residual) => sum + residual ** 2, 0) / Math.max(1, n),
  );
  const anomalies = points.filter((_point, index) =>
    standardDeviation > 0 ? Math.abs(residuals[index]!) > standardDeviation * 2 : false,
  );

  const lastMonth = new Date(`${points[points.length - 1]!.month}-01T00:00:00Z`);
  const forecast = Array.from({ length: periods }, (_, offset) => {
    const date = new Date(
      Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + offset + 1, 1),
    );
    return {
      month: date.toISOString().slice(0, 7),
      value: Math.max(0, Math.round(intercept + slope * (n + offset))),
    };
  });
  return {
    forecast,
    anomalies,
    trendPercent: meanY === 0 ? 0 : Math.round((slope / meanY) * 10000) / 100,
  };
}

export type TypedReport =
  | "overview"
  | "revenue"
  | "lead-funnel"
  | "agent-performance"
  | "destination"
  | "lead-source"
  | "payments"
  | "tasks";

export function classifyReportQuestion(question: string): TypedReport {
  const value = question.toLocaleLowerCase();
  if (/(unpaid|payment|collection|balance|refund)/.test(value)) return "payments";
  if (/(agent|salesperson|staff|leaderboard)/.test(value)) return "agent-performance";
  if (/(destination|dubai|umrah|hajj|country|city)/.test(value)) return "destination";
  if (/(source|facebook|instagram|referral|campaign)/.test(value)) return "lead-source";
  if (/(task|follow.?up|overdue)/.test(value)) return "tasks";
  if (/(lead|conversion|funnel|stage|lost)/.test(value)) return "lead-funnel";
  if (/(revenue|booking value|sales|income)/.test(value)) return "revenue";
  return "overview";
}
