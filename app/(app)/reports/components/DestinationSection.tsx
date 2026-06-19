"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MapPin } from "lucide-react";
import { ChartWrapper } from "./ChartWrapper";
import { getDestinationReportAction } from "@/modules/reports/report.actions";
import { CHART_SERIES } from "@/lib/charts/palette";
import type { DestinationReport } from "@/modules/reports/report.types";
import { formatPKR, deserialize } from "@/lib/money/paisa";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  filters: Record<string, unknown>;
}

function formatAxis(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

export function DestinationSection({ filters }: Props) {
  const [data, setData] = useState<DestinationReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDestinationReportAction(filters).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) {
    return <ChartWrapper loading />;
  }

  if (!data || data.destinations.length === 0) {
    return (
      <ChartWrapper empty emptyMessage="No destination data for the selected period." emptyIcon={<MapPin className="h-10 w-10" />} />
    );
  }

  const fmt = (v: string) => formatPKR(deserialize(v));
  const chartData = data.destinations.slice(0, 10).map((d) => ({
    destination: d.destination,
    revenue: Number(deserialize(d.revenue)) / 100,
    bookings: d.bookingsCount,
  }));

  return (
    <div className="space-y-6">
      {/* Bar Chart */}
      <ChartWrapper>
        <h3 className="mb-4 text-sm font-semibold">Top Destinations by Revenue</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickFormatter={formatAxis} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis type="category" dataKey="destination" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={75} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value: number) => [`Rs ${value.toLocaleString()}`, "Revenue"]}
              />
              <Bar dataKey="revenue" fill={CHART_SERIES.info} radius={[0, 4, 4, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWrapper>

      {/* Metrics Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Destination</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Avg Booking</TableHead>
              <TableHead className="text-right">Conv. %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.destinations.map((d) => (
              <TableRow key={d.destination}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {d.destination}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{d.leadCount}</TableCell>
                <TableCell className="text-right tabular-nums">{d.bookingsCount}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.averageBookingValue)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.conversionRate}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
