import { db } from "@/lib/db";
import { Inbox, TrendingUp, Wallet, Plane, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPKR, type Paisa } from "@/lib/money/paisa";
import { requireUser } from "@/lib/auth/session";
import { pktStartOfDay } from "@/lib/time/tz";
import { dashboardScope } from "./scope";

/**
 * Dashboard KPI stat cards. Server component — queries DB directly since module
 * services are stubs. Read-only per ARCHITECTURE.md §5.12. Scoped to the current
 * user (AGENT sees only their own records). Window definitions mirror the
 * reports overview (active = not BOOKED/TRAVELLED/LOST; collected = positive PAID
 * payments; upcoming travel = CONFIRMED/TICKETED within 30 days; expiring
 * passports = within 180 days) so the two views agree.
 */

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function getStats() {
  const user = await requireUser();
  const scope = dashboardScope(user);

  const today = pktStartOfDay();
  const in30 = addDays(today, 30);
  const in180 = addDays(today, 180);

  const [
    activeEnquiries,
    totalLeads,
    convertedLeads,
    collected,
    upcomingTravel,
    expiringPassports,
  ] = await Promise.all([
    db.lead.count({
      where: { deletedAt: null, status: { notIn: ["BOOKED", "TRAVELLED", "LOST"] }, ...scope.lead },
    }),
    db.lead.count({ where: { deletedAt: null, ...scope.lead } }),
    db.lead.count({
      where: { deletedAt: null, status: { in: ["BOOKED", "TRAVELLED"] }, ...scope.lead },
    }),
    db.payment.aggregate({
      where: { status: "PAID", amountPaisa: { gt: 0n }, ...scope.payment },
      _sum: { amountPaisa: true },
    }),
    db.booking.count({
      where: {
        deletedAt: null,
        status: { in: ["CONFIRMED", "TICKETED"] },
        travelDate: { gte: today, lte: in30 },
        ...scope.booking,
      },
    }),
    db.customer.count({
      where: { deletedAt: null, passportExpiry: { gte: today, lte: in180 }, ...scope.customer },
    }),
  ]);

  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  return {
    activeEnquiries,
    conversionRate,
    revenue: (collected._sum.amountPaisa ?? 0n) as Paisa,
    upcomingTravel,
    expiringPassports,
  };
}

interface StatCardProps {
  title: string;
  value: string | number;
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
          <p className="text-3xl font-bold tracking-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export async function DashboardStats() {
  const stats = await getStats();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        title="Active enquiries"
        value={stats.activeEnquiries}
        icon={<Inbox className="h-5 w-5" />}
        description="Leads in open pipeline"
      />
      <StatCard
        title="Conversion"
        value={`${stats.conversionRate}%`}
        icon={<TrendingUp className="h-5 w-5" />}
        description="Leads booked or travelled"
      />
      <StatCard
        title="Revenue collected"
        value={formatPKR(stats.revenue)}
        icon={<Wallet className="h-5 w-5" />}
        description="Payments received to date"
      />
      <StatCard
        title="Upcoming travel"
        value={stats.upcomingTravel}
        icon={<Plane className="h-5 w-5" />}
        description="Confirmed, next 30 days"
      />
      <StatCard
        title="Expiring passports"
        value={stats.expiringPassports}
        icon={<AlertTriangle className="h-5 w-5" />}
        description="Within 180 days"
      />
    </div>
  );
}
