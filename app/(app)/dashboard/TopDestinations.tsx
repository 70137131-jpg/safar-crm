import { MapPin } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { pktStartOfDay } from "@/lib/time/tz";
import { type DestinationPoint } from "./DashboardCharts";
import { TopDestinationsChart } from "./DashboardChartsLazy";

/**
 * Top destinations by booking revenue over the last 12 months. Destination
 * lives on the originating Lead, so we read it through booking → lead and
 * GROUP BY it in SQL (one row per destination) rather than pulling every
 * booking and aggregating in JS. Ownership-scoped.
 */

const MONTHS_BACK = 12;
const TOP_N = 8;

interface DestinationRow {
  destination: string;
  bookings: number;
  revenuePaisa: bigint;
}

async function getTopDestinations(): Promise<DestinationPoint[]> {
  const user = await requireUser();
  // AGENT sees only bookings whose customer is theirs — mirrors
  // `dashboardScope(user).booking` (customer.assignedAgentId), expressed in SQL.
  const agentId = user.role === "AGENT" ? user.id : null;

  const now = new Date();
  const windowStart = pktStartOfDay(
    new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1),
  );

  // INNER JOIN drops bookings with no lead (leadId NULL); we keep the lead's
  // destination even if the lead is soft-deleted, matching the prior relation
  // include which did not filter on lead.deletedAt. `btrim` + `<> ''` reproduces
  // the old JS `.trim()` skip of blank destinations.
  const agentFilter = agentId
    ? Prisma.sql`AND b."customerId" IN (SELECT id FROM "Customer" WHERE "assignedAgentId" = ${agentId}::uuid)`
    : Prisma.empty;

  const rows = await db.$queryRaw<DestinationRow[]>`
    SELECT
      btrim(l.destination) AS destination,
      COUNT(*)::int AS bookings,
      COALESCE(SUM(b."totalPricePaisa"), 0)::bigint AS "revenuePaisa"
    FROM "Booking" b
    INNER JOIN "Lead" l ON b."leadId" = l.id
    WHERE b."deletedAt" IS NULL
      AND b.status <> 'CANCELLED'
      AND b."createdAt" >= ${windowStart}
      AND l.destination IS NOT NULL
      AND btrim(l.destination) <> ''
      ${agentFilter}
    GROUP BY 1
    ORDER BY "revenuePaisa" DESC
    LIMIT ${TOP_N}
  `;

  return rows.map((r) => ({
    destination: r.destination,
    revenue: Number(r.revenuePaisa) / 100,
    bookings: r.bookings,
  }));
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
