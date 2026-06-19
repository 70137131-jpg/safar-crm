import Link from "next/link";
import { Briefcase } from "lucide-react";
import { db } from "@/lib/db";
import { formatPKR, type Paisa } from "@/lib/money/paisa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";

const STATUS_ORDER = ["PENDING", "CONFIRMED", "TICKETED", "COMPLETED", "CANCELLED"] as const;
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  TICKETED: "Ticketed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

async function getBookingStats() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  const [grouped, revenue] = await Promise.all([
    db.booking.groupBy({
      by: ["status"],
      where: { deletedAt: null, ...scope.booking },
      _count: { _all: true },
    }),
    db.booking.aggregate({
      where: { deletedAt: null, status: { not: "CANCELLED" }, ...scope.booking },
      _sum: { totalPricePaisa: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  return {
    counts,
    totalValue: (revenue._sum.totalPricePaisa ?? 0n) as Paisa,
  };
}

export async function BookingStats() {
  const { counts, totalValue } = await getBookingStats();

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Bookings
        </CardTitle>
        <Link href="/bookings" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        <div>
          <p className="text-xs text-muted-foreground">Pipeline value (active)</p>
          <p className="text-2xl font-bold tracking-tight">{formatPKR(totalValue)}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-lg font-semibold">{counts[status] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
