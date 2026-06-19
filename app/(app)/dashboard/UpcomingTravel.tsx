import { CalendarCheck } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";

async function getUpcomingTravel() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  const today = new Date();
  return db.booking.findMany({
    where: {
      deletedAt: null,
      status: { in: ["CONFIRMED", "TICKETED"] },
      travelDate: { gte: today },
      ...scope.booking,
    },
    orderBy: { travelDate: "asc" },
    take: 8,
    select: {
      id: true,
      bookingNumber: true,
      travelDate: true,
      status: true,
      customer: { select: { name: true } },
    },
  });
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  }).format(date);
}

export async function UpcomingTravel() {
  const bookings = await getUpcomingTravel();

  if (bookings.length === 0) {
    return (
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Upcoming Travel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
            <CalendarCheck className="mb-2 h-8 w-8" />
            <p className="text-sm">No upcoming travel</p>
            <p className="text-xs">Confirmed bookings with future travel dates appear here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Upcoming Travel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{booking.customer.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {booking.bookingNumber}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium">{formatDate(booking.travelDate)}</p>
                <p className="text-xs text-muted-foreground">{booking.status}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
