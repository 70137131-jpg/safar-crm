import { TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { PKT_TZ, pktStartOfDay } from "@/lib/time/tz";
import { dashboardScope } from "./scope";
import { MonthlyTrendsChart, type MonthlyTrendPoint } from "./DashboardCharts";

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

async function getMonthlyTrends(): Promise<MonthlyTrendPoint[]> {
  const user = await requireUser();
  const scope = dashboardScope(user);

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

  const rows = await db.booking.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      createdAt: { gte: windowStart },
      ...scope.booking,
    },
    select: { createdAt: true, totalPricePaisa: true },
  });

  for (const r of rows) {
    const bucket = byKey.get(monthKey(r.createdAt));
    if (!bucket) continue;
    bucket.bookings += 1;
    bucket.revenuePaisa += r.totalPricePaisa;
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
