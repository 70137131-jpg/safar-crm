import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Report repository — pure data access via aggregation queries.
 *
 *   - No business logic, no audit, no permission checks.
 *   - Soft-delete filter (`deletedAt IS NULL`) applied by default.
 *   - All date ranges are inclusive [dateFrom, dateTo].
 *   - Money columns are BigInt paisa.
 */

interface DateRange {
  dateFrom: Date;
  dateTo: Date;
}

interface ReportFilters extends DateRange {
  agentId?: string;
  destination?: string;
  status?: string;
}

// ─── Revenue ────────────────────────────────────────────────────────────────

export interface RevenueRaw {
  totalBooked: bigint;
  bookingCount: number;
  totalCollected: bigint;
  totalRefunded: bigint;
}

export async function getRevenue(filters: ReportFilters): Promise<RevenueRaw> {
  const agentJoin = filters.agentId
    ? Prisma.sql`INNER JOIN "Lead" l ON b."leadId" = l.id AND l."assignedAgentId" = ${filters.agentId}::uuid`
    : Prisma.empty;

  const rows = await db.$queryRaw<RevenueRaw[]>`
    SELECT
      COALESCE(SUM(b."totalPricePaisa"), 0)::bigint AS "totalBooked",
      COUNT(b.id)::int AS "bookingCount",
      COALESCE((
        SELECT SUM(p."amountPaisa")
        FROM "Payment" p
        INNER JOIN "Booking" b2 ON p."bookingId" = b2.id
        ${filters.agentId ? Prisma.sql`INNER JOIN "Lead" l2 ON b2."leadId" = l2.id AND l2."assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
        WHERE p.status = 'PAID' AND p."amountPaisa" > 0
          AND b2."deletedAt" IS NULL
          AND b2."createdAt" >= ${filters.dateFrom}
          AND b2."createdAt" <= ${filters.dateTo}
      ), 0)::bigint AS "totalCollected",
      COALESCE((
        SELECT ABS(SUM(p."amountPaisa"))
        FROM "Payment" p
        INNER JOIN "Booking" b3 ON p."bookingId" = b3.id
        ${filters.agentId ? Prisma.sql`INNER JOIN "Lead" l3 ON b3."leadId" = l3.id AND l3."assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
        WHERE p.status = 'PAID' AND p."amountPaisa" < 0
          AND b3."deletedAt" IS NULL
          AND b3."createdAt" >= ${filters.dateFrom}
          AND b3."createdAt" <= ${filters.dateTo}
      ), 0)::bigint AS "totalRefunded"
    FROM "Booking" b
    ${agentJoin}
    WHERE b."deletedAt" IS NULL
      AND b.status <> 'CANCELLED'
      AND b."createdAt" >= ${filters.dateFrom}
      AND b."createdAt" <= ${filters.dateTo}
      ${filters.destination ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Lead" ld WHERE ld.id = b."leadId" AND ld.destination ILIKE ${"%" + filters.destination + "%"}
      )` : Prisma.empty}
  `;
  return rows[0] ?? { totalBooked: 0n, bookingCount: 0, totalCollected: 0n, totalRefunded: 0n };
}

export interface MonthlyRevenueRow {
  month: string;
  value: bigint;
}

export async function getMonthlyRevenue(filters: ReportFilters): Promise<MonthlyRevenueRow[]> {
  const agentJoin = filters.agentId
    ? Prisma.sql`INNER JOIN "Lead" l ON b."leadId" = l.id AND l."assignedAgentId" = ${filters.agentId}::uuid`
    : Prisma.empty;

  return db.$queryRaw<MonthlyRevenueRow[]>`
    SELECT
      to_char(b."createdAt", 'YYYY-MM') AS month,
      COALESCE(SUM(b."totalPricePaisa"), 0)::bigint AS value
    FROM "Booking" b
    ${agentJoin}
    WHERE b."deletedAt" IS NULL
      AND b.status <> 'CANCELLED'
      AND b."createdAt" >= ${filters.dateFrom}
      AND b."createdAt" <= ${filters.dateTo}
    GROUP BY to_char(b."createdAt", 'YYYY-MM')
    ORDER BY month
  `;
}

export async function getMonthlyCollections(filters: ReportFilters): Promise<MonthlyRevenueRow[]> {
  const agentJoin = filters.agentId
    ? Prisma.sql`INNER JOIN "Booking" b ON p."bookingId" = b.id INNER JOIN "Lead" l ON b."leadId" = l.id AND l."assignedAgentId" = ${filters.agentId}::uuid`
    : Prisma.empty;

  return db.$queryRaw<MonthlyRevenueRow[]>`
    SELECT
      to_char(p."paidAt", 'YYYY-MM') AS month,
      COALESCE(SUM(p."amountPaisa"), 0)::bigint AS value
    FROM "Payment" p
    ${agentJoin}
    WHERE p.status = 'PAID'
      AND p."amountPaisa" > 0
      AND p."paidAt" IS NOT NULL
      AND p."paidAt" >= ${filters.dateFrom}
      AND p."paidAt" <= ${filters.dateTo}
    GROUP BY to_char(p."paidAt", 'YYYY-MM')
    ORDER BY month
  `;
}

// ─── Lead Funnel ────────────────────────────────────────────────────────────

export interface LeadFunnelRow {
  status: string;
  count: number;
}

export async function getLeadFunnel(filters: ReportFilters): Promise<LeadFunnelRow[]> {
  return db.$queryRaw<LeadFunnelRow[]>`
    SELECT
      status::text AS status,
      COUNT(*)::int AS count
    FROM "Lead"
    WHERE "deletedAt" IS NULL
      AND "createdAt" >= ${filters.dateFrom}
      AND "createdAt" <= ${filters.dateTo}
      ${filters.agentId ? Prisma.sql`AND "assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
    GROUP BY status
    ORDER BY
      CASE status
        WHEN 'NEW' THEN 1
        WHEN 'CONTACTED' THEN 2
        WHEN 'QUOTATION_SENT' THEN 3
        WHEN 'NEGOTIATING' THEN 4
        WHEN 'BOOKED' THEN 5
        WHEN 'TRAVELLED' THEN 6
        WHEN 'LOST' THEN 7
      END
  `;
}

// ─── Agent Performance ──────────────────────────────────────────────────────

export interface AgentPerformanceRow {
  agentId: string;
  agentName: string;
  leadsCreated: number;
  bookings: number;
  revenueBooked: bigint;
  revenueCollected: bigint;
  quotationsSent: number;
}

export async function getAgentPerformance(filters: ReportFilters): Promise<AgentPerformanceRow[]> {
  return db.$queryRaw<AgentPerformanceRow[]>`
    SELECT
      u.id AS "agentId",
      u.name AS "agentName",
      COALESCE((
        SELECT COUNT(*)::int FROM "Lead" ld
        WHERE ld."assignedAgentId" = u.id
          AND ld."deletedAt" IS NULL
          AND ld."createdAt" >= ${filters.dateFrom}
          AND ld."createdAt" <= ${filters.dateTo}
      ), 0) AS "leadsCreated",
      COALESCE((
        SELECT COUNT(*)::int FROM "Booking" bk
        INNER JOIN "Lead" l2 ON bk."leadId" = l2.id
        WHERE l2."assignedAgentId" = u.id
          AND bk."deletedAt" IS NULL
          AND bk.status <> 'CANCELLED'
          AND bk."createdAt" >= ${filters.dateFrom}
          AND bk."createdAt" <= ${filters.dateTo}
      ), 0) AS "bookings",
      COALESCE((
        SELECT SUM(bk."totalPricePaisa")::bigint FROM "Booking" bk
        INNER JOIN "Lead" l3 ON bk."leadId" = l3.id
        WHERE l3."assignedAgentId" = u.id
          AND bk."deletedAt" IS NULL
          AND bk.status <> 'CANCELLED'
          AND bk."createdAt" >= ${filters.dateFrom}
          AND bk."createdAt" <= ${filters.dateTo}
      ), 0)::bigint AS "revenueBooked",
      COALESCE((
        SELECT SUM(p."amountPaisa")::bigint FROM "Payment" p
        INNER JOIN "Booking" bk ON p."bookingId" = bk.id
        INNER JOIN "Lead" l4 ON bk."leadId" = l4.id
        WHERE l4."assignedAgentId" = u.id
          AND p.status = 'PAID' AND p."amountPaisa" > 0
          AND bk."createdAt" >= ${filters.dateFrom}
          AND bk."createdAt" <= ${filters.dateTo}
      ), 0)::bigint AS "revenueCollected",
      COALESCE((
        SELECT COUNT(*)::int FROM "Quotation" q
        INNER JOIN "Lead" l5 ON q."leadId" = l5.id
        WHERE l5."assignedAgentId" = u.id
          AND q.status <> 'DRAFT'
          AND q."createdAt" >= ${filters.dateFrom}
          AND q."createdAt" <= ${filters.dateTo}
      ), 0) AS "quotationsSent"
    FROM "User" u
    WHERE u.role = 'AGENT'
      AND u."deactivatedAt" IS NULL
      ${filters.agentId ? Prisma.sql`AND u.id = ${filters.agentId}::uuid` : Prisma.empty}
    ORDER BY "revenueBooked" DESC
  `;
}

// ─── Destination Performance ────────────────────────────────────────────────

export interface DestinationPerformanceRow {
  destination: string;
  leadCount: number;
  bookingsCount: number;
  revenue: bigint;
}

export async function getDestinationPerformance(
  filters: ReportFilters,
): Promise<DestinationPerformanceRow[]> {
  return db.$queryRaw<DestinationPerformanceRow[]>`
    SELECT
      COALESCE(ld.destination, 'Unknown') AS destination,
      COUNT(DISTINCT ld.id)::int AS "leadCount",
      COUNT(DISTINCT bk.id)::int AS "bookingsCount",
      COALESCE(SUM(bk."totalPricePaisa"), 0)::bigint AS revenue
    FROM "Lead" ld
    LEFT JOIN "Booking" bk ON bk."leadId" = ld.id
      AND bk."deletedAt" IS NULL AND bk.status <> 'CANCELLED'
      AND bk."createdAt" >= ${filters.dateFrom}
      AND bk."createdAt" <= ${filters.dateTo}
    WHERE ld."deletedAt" IS NULL
      AND ld."createdAt" >= ${filters.dateFrom}
      AND ld."createdAt" <= ${filters.dateTo}
      AND ld.destination IS NOT NULL
      ${filters.agentId ? Prisma.sql`AND ld."assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
      ${filters.destination ? Prisma.sql`AND ld.destination ILIKE ${"%" + filters.destination + "%"}` : Prisma.empty}
    GROUP BY ld.destination
    ORDER BY revenue DESC
    LIMIT 20
  `;
}

// ─── Lead Source Performance ────────────────────────────────────────────────

export interface LeadSourceRow {
  source: string;
  leadCount: number;
  bookings: number;
  revenue: bigint;
}

export async function getLeadSourcePerformance(
  filters: ReportFilters,
): Promise<LeadSourceRow[]> {
  return db.$queryRaw<LeadSourceRow[]>`
    SELECT
      COALESCE(ld.source, 'Unknown') AS source,
      COUNT(DISTINCT ld.id)::int AS "leadCount",
      COUNT(DISTINCT bk.id)::int AS bookings,
      COALESCE(SUM(bk."totalPricePaisa"), 0)::bigint AS revenue
    FROM "Lead" ld
    LEFT JOIN "Booking" bk ON bk."leadId" = ld.id
      AND bk."deletedAt" IS NULL AND bk.status <> 'CANCELLED'
      AND bk."createdAt" >= ${filters.dateFrom}
      AND bk."createdAt" <= ${filters.dateTo}
    WHERE ld."deletedAt" IS NULL
      AND ld."createdAt" >= ${filters.dateFrom}
      AND ld."createdAt" <= ${filters.dateTo}
      ${filters.agentId ? Prisma.sql`AND ld."assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
    GROUP BY ld.source
    ORDER BY "leadCount" DESC
  `;
}

// ─── Payments Report ────────────────────────────────────────────────────────

export interface BookingPaymentRow {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  totalPricePaisa: bigint;
  totalPaid: bigint;
  totalRefunded: bigint;
  agentName: string | null;
}

export async function getPaymentsReport(
  filters: ReportFilters,
): Promise<BookingPaymentRow[]> {
  return db.$queryRaw<BookingPaymentRow[]>`
    SELECT
      b.id AS "bookingId",
      b."bookingNumber",
      c.name AS "customerName",
      b."totalPricePaisa",
      COALESCE((
        SELECT SUM(p."amountPaisa") FROM "Payment" p
        WHERE p."bookingId" = b.id AND p.status = 'PAID' AND p."amountPaisa" > 0
      ), 0)::bigint AS "totalPaid",
      COALESCE((
        SELECT ABS(SUM(p."amountPaisa")) FROM "Payment" p
        WHERE p."bookingId" = b.id AND p.status = 'PAID' AND p."amountPaisa" < 0
      ), 0)::bigint AS "totalRefunded",
      u.name AS "agentName"
    FROM "Booking" b
    INNER JOIN "Customer" c ON b."customerId" = c.id
    LEFT JOIN "Lead" l ON b."leadId" = l.id
    LEFT JOIN "User" u ON l."assignedAgentId" = u.id
    WHERE b."deletedAt" IS NULL
      AND b.status <> 'CANCELLED'
      AND b."createdAt" >= ${filters.dateFrom}
      AND b."createdAt" <= ${filters.dateTo}
      ${filters.agentId ? Prisma.sql`AND l."assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
      ${filters.status === "paid" ? Prisma.sql`AND (SELECT COALESCE(SUM(p."amountPaisa"),0) FROM "Payment" p WHERE p."bookingId" = b.id AND p.status='PAID') >= b."totalPricePaisa"` : Prisma.empty}
      ${filters.status === "unpaid" ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = b.id AND p.status='PAID' AND p."amountPaisa" > 0)` : Prisma.empty}
      ${filters.status === "partial" ? Prisma.sql`AND (SELECT COALESCE(SUM(p."amountPaisa"),0) FROM "Payment" p WHERE p."bookingId" = b.id AND p.status='PAID' AND p."amountPaisa" > 0) > 0 AND (SELECT COALESCE(SUM(p."amountPaisa"),0) FROM "Payment" p WHERE p."bookingId" = b.id AND p.status='PAID') < b."totalPricePaisa"` : Prisma.empty}
    ORDER BY b."createdAt" DESC
  `;
}

// ─── Task Performance ───────────────────────────────────────────────────────

export interface TaskStatsRaw {
  open: number;
  completed: number;
  overdue: number;
  avgCompletionHours: number | null;
}

export async function getTaskPerformance(filters: ReportFilters): Promise<TaskStatsRaw> {
  const rows = await db.$queryRaw<TaskStatsRaw[]>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'OPEN' AND "dueDate" >= NOW())::int AS open,
      COUNT(*) FILTER (WHERE status = 'DONE')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'OPEN' AND "dueDate" < NOW())::int AS overdue,
      AVG(EXTRACT(EPOCH FROM ("doneAt" - "createdAt")) / 3600) FILTER (WHERE status = 'DONE' AND "doneAt" IS NOT NULL) AS "avgCompletionHours"
    FROM "Task"
    WHERE "createdAt" >= ${filters.dateFrom}
      AND "createdAt" <= ${filters.dateTo}
      ${filters.agentId ? Prisma.sql`AND "assignedToId" = ${filters.agentId}::uuid` : Prisma.empty}
  `;
  return rows[0] ?? { open: 0, completed: 0, overdue: 0, avgCompletionHours: null };
}

export interface MonthlyTaskRow {
  month: string;
  completed: number;
  created: number;
}

export async function getMonthlyTasks(filters: ReportFilters): Promise<MonthlyTaskRow[]> {
  return db.$queryRaw<MonthlyTaskRow[]>`
    SELECT
      to_char(t."createdAt", 'YYYY-MM') AS month,
      COUNT(*) FILTER (WHERE t.status = 'DONE')::int AS completed,
      COUNT(*)::int AS created
    FROM "Task" t
    WHERE t."createdAt" >= ${filters.dateFrom}
      AND t."createdAt" <= ${filters.dateTo}
      ${filters.agentId ? Prisma.sql`AND t."assignedToId" = ${filters.agentId}::uuid` : Prisma.empty}
    GROUP BY to_char(t."createdAt", 'YYYY-MM')
    ORDER BY month
  `;
}

// ─── Overview Stats ─────────────────────────────────────────────────────────

export interface OverviewStatsRaw {
  revenueBooked: bigint;
  revenueCollected: bigint;
  activeLeads: number;
  bookedLeads: number;
  totalLeads: number;
  upcomingTravel: number;
  overdueTasks: number;
  expiringPassports: number;
}

export async function getOverviewStats(filters: ReportFilters): Promise<OverviewStatsRaw> {
  const rows = await db.$queryRaw<OverviewStatsRaw[]>`
    SELECT
      COALESCE((
        SELECT SUM("totalPricePaisa")::bigint FROM "Booking"
        WHERE "deletedAt" IS NULL AND status <> 'CANCELLED'
          AND "createdAt" >= ${filters.dateFrom} AND "createdAt" <= ${filters.dateTo}
          ${filters.agentId ? Prisma.sql`AND "leadId" IN (SELECT id FROM "Lead" WHERE "assignedAgentId" = ${filters.agentId}::uuid)` : Prisma.empty}
      ), 0)::bigint AS "revenueBooked",
      COALESCE((
        SELECT SUM(p."amountPaisa")::bigint FROM "Payment" p
        INNER JOIN "Booking" b ON p."bookingId" = b.id
        WHERE p.status = 'PAID' AND p."amountPaisa" > 0
          AND b."deletedAt" IS NULL
          AND p."paidAt" >= ${filters.dateFrom} AND p."paidAt" <= ${filters.dateTo}
          ${filters.agentId ? Prisma.sql`AND b."leadId" IN (SELECT id FROM "Lead" WHERE "assignedAgentId" = ${filters.agentId}::uuid)` : Prisma.empty}
      ), 0)::bigint AS "revenueCollected",
      (SELECT COUNT(*)::int FROM "Lead"
        WHERE "deletedAt" IS NULL AND status NOT IN ('BOOKED', 'TRAVELLED', 'LOST')
        ${filters.agentId ? Prisma.sql`AND "assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
      ) AS "activeLeads",
      (SELECT COUNT(*)::int FROM "Lead"
        WHERE "deletedAt" IS NULL AND status = 'BOOKED'
          AND "createdAt" >= ${filters.dateFrom} AND "createdAt" <= ${filters.dateTo}
        ${filters.agentId ? Prisma.sql`AND "assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
      ) AS "bookedLeads",
      (SELECT COUNT(*)::int FROM "Lead"
        WHERE "deletedAt" IS NULL
          AND "createdAt" >= ${filters.dateFrom} AND "createdAt" <= ${filters.dateTo}
        ${filters.agentId ? Prisma.sql`AND "assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
      ) AS "totalLeads",
      (SELECT COUNT(*)::int FROM "Booking"
        WHERE "deletedAt" IS NULL AND status IN ('CONFIRMED', 'TICKETED')
          AND "travelDate" >= CURRENT_DATE AND "travelDate" <= CURRENT_DATE + 30
        ${filters.agentId ? Prisma.sql`AND "leadId" IN (SELECT id FROM "Lead" WHERE "assignedAgentId" = ${filters.agentId}::uuid)` : Prisma.empty}
      ) AS "upcomingTravel",
      (SELECT COUNT(*)::int FROM "Task"
        WHERE status = 'OPEN' AND "dueDate" < NOW()
        ${filters.agentId ? Prisma.sql`AND "assignedToId" = ${filters.agentId}::uuid` : Prisma.empty}
      ) AS "overdueTasks",
      (SELECT COUNT(*)::int FROM "Customer"
        WHERE "deletedAt" IS NULL AND "passportExpiry" IS NOT NULL
          AND "passportExpiry" <= CURRENT_DATE + 180 AND "passportExpiry" >= CURRENT_DATE
        ${filters.agentId ? Prisma.sql`AND "assignedAgentId" = ${filters.agentId}::uuid` : Prisma.empty}
      ) AS "expiringPassports"
  `;
  return rows[0] ?? {
    revenueBooked: 0n, revenueCollected: 0n, activeLeads: 0, bookedLeads: 0,
    totalLeads: 0, upcomingTravel: 0, overdueTasks: 0, expiringPassports: 0,
  };
}

export async function getRecentPayments(agentId?: string) {
  return db.payment.findMany({
    where: {
      status: "PAID",
      amountPaisa: { gt: 0 },
      ...(agentId ? {
        booking: { lead: { assignedAgentId: agentId } },
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      amountPaisa: true,
      method: true,
      paidAt: true,
      createdAt: true,
      booking: {
        select: {
          bookingNumber: true,
          customer: { select: { name: true } },
        },
      },
    },
  });
}

export async function getRecentBookings(agentId?: string) {
  return db.booking.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      ...(agentId ? {
        lead: { assignedAgentId: agentId },
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      bookingNumber: true,
      totalPricePaisa: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
  });
}

export async function getRecentQuotations(agentId?: string) {
  return db.quotation.findMany({
    where: {
      ...(agentId ? {
        lead: { assignedAgentId: agentId },
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      quoteNumber: true,
      totalPaisa: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
  });
}
