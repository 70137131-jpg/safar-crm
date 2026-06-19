import { z } from "zod";

/**
 * Report Zod schemas — one per action input.
 *
 * Shared base: date range (default last 30 days), optional agent/destination.
 * Date validation: dateTo >= dateFrom, max 1 year span.
 */

// ─── Shared Filters ─────────────────────────────────────────────────────────

const thirtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
};

export const reportFiltersSchema = z
  .object({
    dateFrom: z.coerce.date().default(thirtyDaysAgo),
    dateTo: z.coerce.date().default(() => new Date()),
    agentId: z.string().uuid().optional(),
    destination: z.string().trim().optional(),
    status: z.string().trim().optional(),
  })
  .refine((d) => d.dateTo >= d.dateFrom, {
    message: "End date must be on or after start date",
    path: ["dateTo"],
  })
  .refine(
    (d) => {
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      return d.dateTo.getTime() - d.dateFrom.getTime() <= oneYear;
    },
    {
      message: "Date range must not exceed 1 year",
      path: ["dateTo"],
    },
  );

export type ReportFiltersInput = z.infer<typeof reportFiltersSchema>;

// ─── Export ─────────────────────────────────────────────────────────────────

export const exportReportSchema = z.object({
  reportType: z.enum([
    "revenue",
    "lead-funnel",
    "agent-performance",
    "destination",
    "lead-source",
    "payments",
    "tasks",
  ]),
  format: z.enum(["csv", "excel", "pdf"]),
  filters: reportFiltersSchema,
});

export type ExportReportInput = z.infer<typeof exportReportSchema>;
