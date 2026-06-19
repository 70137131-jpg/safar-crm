import { CreditCard } from "lucide-react";
import { db } from "@/lib/db";
import { formatPKR, type Paisa } from "@/lib/money/paisa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CARD: "Card",
  OTHER: "Other",
};

async function getRecentPayments() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  return db.payment.findMany({
    where: { status: "PAID", ...scope.payment },
    orderBy: { createdAt: "desc" },
    take: 8,
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

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Karachi",
  }).format(date);
}

export async function RecentPayments() {
  const payments = await getRecentPayments();

  if (payments.length === 0) {
    return (
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
            <CreditCard className="mb-2 h-8 w-8" />
            <p className="text-sm">No payments recorded</p>
            <p className="text-xs">Payments will appear here once recorded.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {payment.booking.customer.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {payment.booking.bookingNumber} · {METHOD_LABELS[payment.method] ?? payment.method}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium">
                  {formatPKR(payment.amountPaisa as Paisa)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(payment.paidAt ?? payment.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
