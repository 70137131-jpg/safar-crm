import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { pktStartOfDay } from "@/lib/time/tz";
import { dashboardScope } from "./scope";
import { TopDestinationsChart, type DestinationPoint } from "./DashboardCharts";

/**
 * Top destinations by booking revenue over the last 12 months. Destination
 * lives on the originating Lead, so we read it through booking.lead and
 * aggregate in JS (Prisma can't groupBy a relation field). Ownership-scoped.
 */

const MONTHS_BACK = 12;
const TOP_N = 8;

async function getTopDestinations(): Promise<DestinationPoint[]> {
  const user = await requireUser();
  const scope = dashboardScope(user);

  const now = new Date();
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
    select: { totalPricePaisa: true, lead: { select: { destination: true } } },
  });

  const agg = new Map<string, { revenuePaisa: bigint; bookings: number }>();
  for (const r of rows) {
    const dest = r.lead?.destination?.trim();
    if (!dest) continue;
    const cur = agg.get(dest) ?? { revenuePaisa: 0n, bookings: 0 };
    cur.revenuePaisa += r.totalPricePaisa;
    cur.bookings += 1;
    agg.set(dest, cur);
  }

  return [...agg.entries()]
    .map(([destination, v]) => ({
      destination,
      revenue: Number(v.revenuePaisa) / 100,
      bookings: v.bookings,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_N);
}

export async function TopDestinations() {
  const data = await getTopDestinations();

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Top destinations
        </CardTitle>
        <span className="text-xs text-muted-foreground">Last 12 months</span>
      </CardHeader>
      <CardContent>
        <TopDestinationsChart data={data} />
      </CardContent>
    </Card>
  );
}
