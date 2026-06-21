"use client";

import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_SERIES } from "@/lib/charts/palette";

/**
 * Client Recharts widgets for the dashboard. Data is fetched + ownership-scoped
 * in the server components (MonthlyTrends / TopDestinations) and passed in as
 * plain numbers — money arrives pre-converted to PKR (paisa ÷ 100), never as a
 * BigInt (which is not serializable across the server→client boundary).
 */

export interface MonthlyTrendPoint {
  label: string;
  bookings: number;
  /** Revenue in PKR (rupees), not paisa. */
  revenue: number;
}

export interface DestinationPoint {
  destination: string;
  /** Revenue in PKR (rupees), not paisa. */
  revenue: number;
  bookings: number;
}

function formatAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
  color: "hsl(var(--popover-foreground))",
} as const;

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function MonthlyTrendsChart({ data }: { data: MonthlyTrendPoint[] }) {
  const isEmpty = data.every((d) => d.bookings === 0 && d.revenue === 0);
  if (isEmpty) return <EmptyChart message="No bookings in the last 6 months." />;

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
          <YAxis
            yAxisId="rev"
            tickFormatter={formatAxis}
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            width={44}
          />
          <YAxis
            yAxisId="cnt"
            orientation="right"
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            width={28}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) =>
              name === "Revenue"
                ? [`Rs ${Number(value).toLocaleString()}`, name]
                : [value, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar
            yAxisId="cnt"
            dataKey="bookings"
            name="Bookings"
            fill={CHART_SERIES.info}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
          <Line
            yAxisId="rev"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={CHART_SERIES.primary}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopDestinationsChart({ data }: { data: DestinationPoint[] }) {
  if (data.length === 0) return <EmptyChart message="No destination data yet." />;

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            type="number"
            tickFormatter={formatAxis}
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
          <YAxis
            type="category"
            dataKey="destination"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={90}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) =>
              name === "Revenue"
                ? [`Rs ${Number(value).toLocaleString()}`, name]
                : [value, name]
            }
          />
          <Bar
            dataKey="revenue"
            name="Revenue"
            fill={CHART_SERIES.info}
            radius={[0, 4, 4, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
