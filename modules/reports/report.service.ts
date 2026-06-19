import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { serialize } from "@/lib/money/paisa";
import * as repo from "./report.repository";
import type {
  RevenueReport,
  LeadFunnelReport,
  LeadFunnelStage,
  AgentPerformanceReport,
  AgentMetrics,
  DestinationReport,
  DestinationMetrics,
  LeadSourceReport,
  PaymentsReport,
  PaymentReportItem,
  TaskPerformanceReport,
  MonthlyDataPoint,
  MonthlyTaskPoint,
  OverviewDashboard,
  RecentPaymentItem,
  RecentBookingItem,
  RecentQuotationItem,
  ReportType,
  ExportFormat,
} from "./report.types";
import type { ReportFiltersInput } from "./report.schemas";

/**
 * Report service — business logic, permission checks, scoping.
 *
 *   - AGENT sees only own data (agentId auto-injected).
 *   - ACCOUNTANT sees only financial reports (revenue, payments).
 *   - Date range validated by Zod schema (max 1 year).
 *   - BigInt paisa values serialized to string for JSON safety.
 *   - Exports are audited via withAudit().
 */

const LEAD_STAGE_ORDER = [
  "NEW",
  "CONTACTED",
  "QUOTATION_SENT",
  "NEGOTIATING",
  "BOOKED",
  "TRAVELLED",
  "LOST",
] as const;

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_LABELS[month!] ?? month} ${year}`;
}

function toFilters(user: UserContext, input: ReportFiltersInput) {
  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    agentId: user.role === "AGENT" ? user.id : input.agentId,
    destination: input.destination,
    status: input.status,
  };
}

function requireFinancialOnly(user: UserContext, reportType: string): void {
  if (user.role === "ACCOUNTANT") {
    const financialReports = ["revenue", "payments"];
    if (!financialReports.includes(reportType)) {
      throw new ForbiddenError(
        "Accountants can only access financial reports (Revenue, Payments).",
      );
    }
  }
}

function auditContext(user: UserContext) {
  return { actorId: user.id, ip: user.ip, userAgent: user.userAgent };
}

// ─── Revenue Report ─────────────────────────────────────────────────────────

export async function getRevenueReport(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<RevenueReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "revenue");

  const filters = toFilters(user, input);
  const [raw, monthly, collections] = await Promise.all([
    repo.getRevenue(filters),
    repo.getMonthlyRevenue(filters),
    repo.getMonthlyCollections(filters),
  ]);

  const outstanding = raw.totalBooked - raw.totalCollected - raw.totalRefunded;
  const avg = raw.bookingCount > 0 ? raw.totalBooked / BigInt(raw.bookingCount) : 0n;

  return {
    revenueBooked: serialize(raw.totalBooked),
    revenueCollected: serialize(raw.totalCollected),
    outstandingBalance: serialize(outstanding > 0n ? outstanding : 0n),
    refundTotal: serialize(raw.totalRefunded),
    averageBookingValue: serialize(avg),
    bookingCount: raw.bookingCount,
    monthlyRevenue: monthly.map((r): MonthlyDataPoint => ({
      month: r.month,
      label: monthLabel(r.month),
      value: serialize(r.value),
    })),
    monthlyCollections: collections.map((r): MonthlyDataPoint => ({
      month: r.month,
      label: monthLabel(r.month),
      value: serialize(r.value),
    })),
  };
}

// ─── Lead Funnel ────────────────────────────────────────────────────────────

export async function getLeadFunnel(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<LeadFunnelReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "lead-funnel");

  const filters = toFilters(user, input);
  const rows = await repo.getLeadFunnel(filters);

  const countMap = new Map(rows.map((r) => [r.status, r.count]));
  const totalLeads = rows.reduce((sum, r) => sum + r.count, 0);

  const stages: LeadFunnelStage[] = LEAD_STAGE_ORDER.map((stage, i) => {
    const count = countMap.get(stage) ?? 0;
    const percentage = totalLeads > 0 ? Math.round((count / totalLeads) * 10000) / 100 : 0;
    const prevCount = i > 0 ? (countMap.get(LEAD_STAGE_ORDER[i - 1]!) ?? 0) : totalLeads;
    const dropOff = prevCount > 0 && i > 0
      ? Math.round(((prevCount - count) / prevCount) * 10000) / 100
      : 0;
    return { stage, count, percentage, dropOff };
  });

  return { stages, totalLeads };
}

// ─── Agent Performance ──────────────────────────────────────────────────────

export async function getAgentPerformance(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<AgentPerformanceReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "agent-performance");

  const filters = toFilters(user, input);
  const rows = await repo.getAgentPerformance(filters);

  const agents: AgentMetrics[] = rows.map((r) => ({
    agentId: r.agentId,
    agentName: r.agentName,
    leadsCreated: r.leadsCreated,
    bookings: r.bookings,
    revenueBooked: serialize(r.revenueBooked),
    revenueCollected: serialize(r.revenueCollected),
    quotationsSent: r.quotationsSent,
    conversionRate: r.leadsCreated > 0
      ? Math.round((r.bookings / r.leadsCreated) * 10000) / 100
      : 0,
  }));

  const highestRevenue = agents.length > 0
    ? agents.reduce((a, b) =>
        BigInt(a.revenueBooked) >= BigInt(b.revenueBooked) ? a : b)
    : null;

  const highestConversion = agents.length > 0
    ? agents.reduce((a, b) => (a.conversionRate >= b.conversionRate ? a : b))
    : null;

  return {
    agents,
    leaderboard: { highestRevenue, highestConversion },
  };
}

// ─── Destination Performance ────────────────────────────────────────────────

export async function getDestinationReport(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<DestinationReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "destination");

  const filters = toFilters(user, input);
  const rows = await repo.getDestinationPerformance(filters);

  const destinations: DestinationMetrics[] = rows.map((r) => ({
    destination: r.destination,
    bookingsCount: r.bookingsCount,
    revenue: serialize(r.revenue),
    averageBookingValue:
      r.bookingsCount > 0
        ? serialize(r.revenue / BigInt(r.bookingsCount))
        : serialize(0n),
    conversionRate:
      r.leadCount > 0
        ? Math.round((r.bookingsCount / r.leadCount) * 10000) / 100
        : 0,
    leadCount: r.leadCount,
  }));

  return { destinations };
}

// ─── Lead Source Report ─────────────────────────────────────────────────────

export async function getLeadSourceReport(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<LeadSourceReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "lead-source");

  const filters = toFilters(user, input);
  const rows = await repo.getLeadSourcePerformance(filters);

  return {
    sources: rows.map((r) => ({
      source: r.source,
      leadCount: r.leadCount,
      bookings: r.bookings,
      conversionRate:
        r.leadCount > 0
          ? Math.round((r.bookings / r.leadCount) * 10000) / 100
          : 0,
      revenue: serialize(r.revenue),
    })),
  };
}

// ─── Payments Report ────────────────────────────────────────────────────────

export async function getPaymentsReport(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<PaymentsReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "payments");

  const filters = toFilters(user, input);
  const rows = await repo.getPaymentsReport(filters);

  let totalPaid = 0n;
  let totalUnpaid = 0n;
  let totalPartial = 0n;
  let totalRefunded = 0n;
  let outstandingBalances = 0n;
  let paidCount = 0;
  let unpaidCount = 0;
  let partialCount = 0;
  let refundedCount = 0;

  const payments: PaymentReportItem[] = rows.map((r) => {
    const paid = r.totalPaid;
    const price = r.totalPricePaisa;
    const refunded = r.totalRefunded;
    const outst = price - paid + refunded;

    let status: PaymentReportItem["status"];
    if (refunded > 0n) {
      status = "refunded";
      totalRefunded += refunded;
      refundedCount++;
    } else if (paid >= price) {
      status = "paid";
      totalPaid += paid;
      paidCount++;
    } else if (paid > 0n) {
      status = "partial";
      totalPartial += paid;
      partialCount++;
    } else {
      status = "unpaid";
      totalUnpaid += price;
      unpaidCount++;
    }
    if (outst > 0n) outstandingBalances += outst;

    return {
      bookingId: r.bookingId,
      bookingNumber: r.bookingNumber,
      customerName: r.customerName,
      totalPrice: serialize(price),
      totalPaid: serialize(paid),
      outstanding: serialize(outst > 0n ? outst : 0n),
      status,
      agentName: r.agentName,
    };
  });

  return {
    totalPaid: serialize(totalPaid),
    totalUnpaid: serialize(totalUnpaid),
    totalPartial: serialize(totalPartial),
    totalRefunded: serialize(totalRefunded),
    outstandingBalances: serialize(outstandingBalances),
    paidCount,
    unpaidCount,
    partialCount,
    refundedCount,
    payments,
  };
}

// ─── Task Performance ───────────────────────────────────────────────────────

export async function getTaskReport(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<TaskPerformanceReport> {
  requirePermission(user, "reports:view");
  requireFinancialOnly(user, "tasks");

  const filters = toFilters(user, input);
  const [stats, monthly] = await Promise.all([
    repo.getTaskPerformance(filters),
    repo.getMonthlyTasks(filters),
  ]);

  const total = stats.open + stats.completed + stats.overdue;
  const completionRate = total > 0
    ? Math.round((stats.completed / total) * 10000) / 100
    : 0;

  return {
    open: stats.open,
    completed: stats.completed,
    overdue: stats.overdue,
    completionRate,
    averageCompletionHours: stats.avgCompletionHours
      ? Math.round(stats.avgCompletionHours * 10) / 10
      : 0,
    monthlyTrend: monthly.map((r): MonthlyTaskPoint => ({
      month: r.month,
      label: monthLabel(r.month),
      completed: r.completed,
      created: r.created,
    })),
  };
}

// ─── Overview Dashboard ─────────────────────────────────────────────────────

export async function getOverviewDashboard(
  user: UserContext,
  input: ReportFiltersInput,
): Promise<OverviewDashboard> {
  requirePermission(user, "reports:view");

  const agentId = user.role === "AGENT" ? user.id : input.agentId;
  const filters = toFilters(user, input);

  const [stats, payments, bookings, quotations] = await Promise.all([
    repo.getOverviewStats(filters),
    repo.getRecentPayments(agentId),
    repo.getRecentBookings(agentId),
    repo.getRecentQuotations(agentId),
  ]);

  const outstanding = stats.revenueBooked - stats.revenueCollected;
  const conversionRate = stats.totalLeads > 0
    ? Math.round((stats.bookedLeads / stats.totalLeads) * 10000) / 100
    : 0;

  return {
    revenueBooked: serialize(stats.revenueBooked),
    revenueCollected: serialize(stats.revenueCollected),
    outstandingBalance: serialize(outstanding > 0n ? outstanding : 0n),
    activeLeads: stats.activeLeads,
    conversionRate,
    upcomingTravel: stats.upcomingTravel,
    overdueTasks: stats.overdueTasks,
    expiringPassports: stats.expiringPassports,
    recentPayments: payments.map((p): RecentPaymentItem => ({
      id: p.id,
      amount: serialize(p.amountPaisa as bigint),
      method: p.method,
      customerName: p.booking.customer.name,
      bookingNumber: p.booking.bookingNumber,
      paidAt: (p.paidAt ?? p.createdAt).toISOString(),
    })),
    recentBookings: bookings.map((b): RecentBookingItem => ({
      id: b.id,
      bookingNumber: b.bookingNumber,
      customerName: b.customer.name,
      totalPrice: serialize(b.totalPricePaisa as bigint),
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
    recentQuotations: quotations.map((q): RecentQuotationItem => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      customerName: q.customer?.name ?? null,
      total: serialize(q.totalPaisa as bigint),
      status: q.status,
      createdAt: q.createdAt.toISOString(),
    })),
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportReport(
  user: UserContext,
  reportType: ReportType,
  format: ExportFormat,
  input: ReportFiltersInput,
): Promise<{ data: unknown; reportType: ReportType; format: ExportFormat }> {
  requirePermission(user, "reports:export");
  requireFinancialOnly(user, reportType);

  // Fetch the report data
  let data: unknown;
  switch (reportType) {
    case "revenue":
      data = await getRevenueReport(user, input);
      break;
    case "lead-funnel":
      data = await getLeadFunnel(user, input);
      break;
    case "agent-performance":
      data = await getAgentPerformance(user, input);
      break;
    case "destination":
      data = await getDestinationReport(user, input);
      break;
    case "lead-source":
      data = await getLeadSourceReport(user, input);
      break;
    case "payments":
      data = await getPaymentsReport(user, input);
      break;
    case "tasks":
      data = await getTaskReport(user, input);
      break;
  }

  // Audit the export
  await withAudit(
    {
      ...auditContext(user),
      action: "report.export",
      entity: "Report",
      before: null,
      entityIdFromResult: () => reportType,
      afterFromResult: () => ({
        reportType,
        format,
        dateFrom: input.dateFrom.toISOString(),
        dateTo: input.dateTo.toISOString(),
      }),
    },
    async () => ({ reportType, format }),
  );

  return { data, reportType, format };
}
