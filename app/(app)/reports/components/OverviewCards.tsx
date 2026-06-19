"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Users,
  Target,
  Plane,
  Clock,
  Shield,
  CreditCard,
  CalendarCheck,
  FileText,
} from "lucide-react";
import { StatCard } from "./ChartWrapper";
import { getOverviewDashboardAction } from "@/modules/reports/report.actions";
import type { OverviewDashboard } from "@/modules/reports/report.types";
import { formatPKR, deserialize } from "@/lib/money/paisa";

interface Props {
  filters: Record<string, unknown>;
}

export function OverviewCards({ filters }: Props) {
  const [data, setData] = useState<OverviewDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOverviewDashboardAction(filters).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-7 w-28 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">Unable to load overview data.</p>
      </div>
    );
  }

  const fmt = (v: string) => formatPKR(deserialize(v));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Revenue Booked"
          value={fmt(data.revenueBooked)}
          icon={<DollarSign className="h-5 w-5" />}
          trend="up"
        />
        <StatCard
          title="Revenue Collected"
          value={fmt(data.revenueCollected)}
          icon={<TrendingUp className="h-5 w-5" />}
          trend="up"
        />
        <StatCard
          title="Outstanding Balance"
          value={fmt(data.outstandingBalance)}
          icon={<AlertCircle className="h-5 w-5" />}
          trend={data.outstandingBalance !== "0" ? "down" : "neutral"}
        />
        <StatCard
          title="Active Leads"
          value={data.activeLeads}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Conversion Rate"
          value={`${data.conversionRate}%`}
          icon={<Target className="h-5 w-5" />}
          trend={data.conversionRate > 10 ? "up" : "neutral"}
        />
        <StatCard
          title="Upcoming Travel"
          value={data.upcomingTravel}
          subtitle="Next 30 days"
          icon={<Plane className="h-5 w-5" />}
        />
        <StatCard
          title="Overdue Tasks"
          value={data.overdueTasks}
          icon={<Clock className="h-5 w-5" />}
          trend={data.overdueTasks > 0 ? "down" : "neutral"}
        />
        <StatCard
          title="Expiring Passports"
          value={data.expiringPassports}
          subtitle="Within 6 months"
          icon={<Shield className="h-5 w-5" />}
          trend={data.expiringPassports > 0 ? "down" : "neutral"}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Payments */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Recent Payments
          </h3>
          {data.recentPayments.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No recent payments</p>
          ) : (
            <div className="space-y-3">
              {data.recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.bookingNumber}</p>
                  </div>
                  <p className="shrink-0 text-xs font-medium">{fmt(p.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Bookings */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            Recent Bookings
          </h3>
          {data.recentBookings.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No recent bookings</p>
          ) : (
            <div className="space-y-3">
              {data.recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{b.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.bookingNumber}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium">{fmt(b.totalPrice)}</p>
                    <span className="inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Quotations */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Recent Quotations
          </h3>
          {data.recentQuotations.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No recent quotations</p>
          ) : (
            <div className="space-y-3">
              {data.recentQuotations.map((q) => (
                <div key={q.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{q.customerName ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{q.quoteNumber ?? "Draft"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium">{fmt(q.total)}</p>
                    <span className="inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      {q.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
