import { db } from "@/lib/db";
import {
  Users,
  Workflow,
  CalendarCheck,
  CreditCard,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";

/**
 * Dashboard KPI stat cards. Server component — queries DB directly
 * since module services are stubs. Read-only per ARCHITECTURE.md §5.12.
 * Scoped to the current user (AGENT sees only their own records).
 */

async function getStats() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  const [customerCount, leadCount, bookingCount, paymentCount] =
    await Promise.all([
      db.customer.count({ where: { deletedAt: null, ...scope.customer } }),
      db.lead.count({ where: { deletedAt: null, ...scope.lead } }),
      db.booking.count({ where: { deletedAt: null, status: { not: "CANCELLED" }, ...scope.booking } }),
      db.payment.count({ where: { status: "PAID", ...scope.payment } }),
    ]);

  return { customerCount, leadCount, bookingCount, paymentCount };
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        <div className="mt-2">
          <p className="text-3xl font-bold tracking-tight">{value.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export async function DashboardStats() {
  const stats = await getStats();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Customers"
        value={stats.customerCount}
        icon={<Users className="h-5 w-5" />}
        description="Active customer records"
      />
      <StatCard
        title="Open Leads"
        value={stats.leadCount}
        icon={<Workflow className="h-5 w-5" />}
        description="Enquiries in pipeline"
      />
      <StatCard
        title="Active Bookings"
        value={stats.bookingCount}
        icon={<CalendarCheck className="h-5 w-5" />}
        description="Non-cancelled bookings"
      />
      <StatCard
        title="Payments"
        value={stats.paymentCount}
        icon={<CreditCard className="h-5 w-5" />}
        description="Recorded payments"
      />
    </div>
  );
}
