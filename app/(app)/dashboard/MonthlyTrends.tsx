import { TrendingUp } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { PKT_TZ, pktStartOfDay } from "@/lib/time/tz";
import { type MonthlyTrendPoint } from "./DashboardCharts";
import { MonthlyTrendsChart } from "./DashboardChartsLazy";

/**
 * Monthly bookings & revenue over the last 6 months. Server component:
 * queries the DB directly (module services are stubs for the read-only
 * dashboard) and applies ownership scoping so an AGENT only sees their own.
 */

const MONTHS_BACK = 6;

/** "YYYY-MM" in PKT, so month buckets line up with how the agency reads dates. */
function monthKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT_TZ,
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

interface MonthlyTrendRow {
  month: string; // "YYYY-MM" in PKT
  bookings: number;
  revenuePaisa: bigint;
}

async function getMonthlyTrends(): Promise<MonthlyTrendPoint[]> {
  const user = await requireUser();
  // AGENT sees only bookings whose customer is theirs — mirrors
  // `dashboardScope(user).booking` (customer.assignedAgentId), expressed in SQL.
  const agentId = user.role === "AGENT" ? user.id : null;

  const now = new Date();
  const buckets = Array.from({ length: MONTHS_BACK }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1 - i), 1);
    return {
      key: monthKey(d),
      label: d.toLocaleString("en-US", { month: "short" }),
      bookings: 0,
      revenuePaisa: 0n,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const windowStart = pktStartOfDay(
    new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1),
  );

  // Aggregate in the DB (one GROUP BY per PKT month) instead of pulling every
  // booking row and bucketing in JS. `createdAt` is timestamptz, so `AT TIME
  // ZONE` yields the Karachi wall-clock month, matching the Intl-based
  // `monthKey` buckets exactly.
  const agentFilter = agentId
    ? Prisma.sql`AND b."customerId" IN (SELECT id FROM "Customer" WHERE "assignedAgentId" = ${agentId}::uuid)`
    : Prisma.empty;

  const rows = await db.$queryRaw<MonthlyTrendRow[]>`
    SELECT
      to_char(b."createdAt" AT TIME ZONE ${PKT_TZ}, 'YYYY-MM') AS month,
      COUNT(*)::int AS bookings,
      COALESCE(SUM(b."totalPricePaisa"), 0)::bigint AS "revenuePaisa"
    FROM "Booking" b
    WHERE b."deletedAt" IS NULL
      AND b.status <> 'CANCELLED'
      AND b."createdAt" >= ${windowStart}
      ${agentFilter}
    GROUP BY 1
  `;

  for (const r of rows) {
    const bucket = byKey.get(r.month);
    if (!bucket) continue;
    bucket.bookings = r.bookings;
    bucket.revenuePaisa = r.revenuePaisa;
  }

  return buckets.map((b) => ({
    label: b.label,
    bookings: b.bookings,
    revenue: Number(b.revenuePaisa) / 100,
  }));
}

export async function MonthlyTrends() {
  const data = await getMonthlyTrends();

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Monthly bookings &amp; revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MonthlyTrendsChart data={data} />
      </CardContent>
    </Card>
  );
}
