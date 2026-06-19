"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { DollarSign, TrendingUp, AlertCircle, RotateCcw, BarChart3 } from "lucide-react";
import { ChartWrapper, StatCard } from "./ChartWrapper";
import { getRevenueReportAction } from "@/modules/reports/report.actions";
import { CHART_SERIES } from "@/lib/charts/palette";
import type { RevenueReport } from "@/modules/reports/report.types";
import { formatPKR, deserialize } from "@/lib/money/paisa";

interface Props {
  filters: Record<string, unknown>;
}

function chartPKR(v: string): number {
  return Number(deserialize(v)) / 100;
}

function formatAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

export function RevenueSection({ filters }: Props) {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRevenueReportAction(filters).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-7 w-28 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <ChartWrapper loading />
      </div>
    );
  }

  if (!data) {
    return (
      <ChartWrapper empty emptyMessage="No revenue data available." emptyIcon={<DollarSign className="h-10 w-10" />} />
    );
  }

  const fmt = (v: string) => formatPKR(deserialize(v));

  // Combine monthly revenue and collections for the chart
  const allMonths = new Set([
    ...data.monthlyRevenue.map((m) => m.month),
    ...data.monthlyCollections.map((m) => m.month),
  ]);
  const revenueMap = new Map(data.monthlyRevenue.map((m) => [m.month, m]));
  const collectionsMap = new Map(data.monthlyCollections.map((m) => [m.month, m]));

  const chartData = Array.from(allMonths)
    .sort()
    .map((month) => ({
      month,
      label: revenueMap.get(month)?.label ?? collectionsMap.get(month)?.label ?? month,
      revenue: chartPKR(revenueMap.get(month)?.value ?? "0"),
      collections: chartPKR(collectionsMap.get(month)?.value ?? "0"),
    }));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
          title="Outstanding"
          value={fmt(data.outstandingBalance)}
          icon={<AlertCircle className="h-5 w-5" />}
          trend={data.outstandingBalance !== "0" ? "down" : "neutral"}
        />
        <StatCard
          title="Refunds"
          value={fmt(data.refundTotal)}
          icon={<RotateCcw className="h-5 w-5" />}
        />
        <StatCard
          title="Avg Booking Value"
          value={fmt(data.averageBookingValue)}
          subtitle={`${data.bookingCount} bookings`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      {/* Chart */}
      <ChartWrapper empty={chartData.length === 0} emptyMessage="No monthly data to chart.">
        <h3 className="mb-4 text-sm font-semibold">Monthly Revenue & Collections</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="collectGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tickFormatter={formatAxis}
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value: number) => [`Rs ${value.toLocaleString()}`, undefined]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue Booked"
                stroke={CHART_SERIES.primary}
                fill="url(#revenueGrad)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="collections"
                name="Collections"
                stroke={CHART_SERIES.positive}
                fill="url(#collectGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartWrapper>
    </div>
  );
}
