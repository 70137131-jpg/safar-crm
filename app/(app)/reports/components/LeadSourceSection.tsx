"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Megaphone } from "lucide-react";
import { ChartWrapper } from "./ChartWrapper";
import { getLeadSourceReportAction } from "@/modules/reports/report.actions";
import type { LeadSourceReport } from "@/modules/reports/report.types";
import { formatPKR, deserialize } from "@/lib/money/paisa";
import { CHART_CATEGORICAL } from "@/lib/charts/palette";
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

const PIE_COLORS = CHART_CATEGORICAL;

export function LeadSourceSection({ filters }: Props) {
  const [data, setData] = useState<LeadSourceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeadSourceReportAction(filters).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) {
    return <ChartWrapper loading />;
  }

  if (!data || data.sources.length === 0) {
    return (
      <ChartWrapper empty emptyMessage="No lead source data available." emptyIcon={<Megaphone className="h-10 w-10" />} />
    );
  }

  const fmt = (v: string) => formatPKR(deserialize(v));
  const pieData = data.sources.map((s) => ({
    name: s.source,
    value: s.leadCount,
  }));

  return (
    <div className="space-y-6">
      {/* Pie Chart */}
      <ChartWrapper>
        <h3 className="mb-4 text-sm font-semibold">Lead Distribution by Source</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={{ strokeWidth: 1 }}
              >
                {pieData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={PIE_COLORS[i % PIE_COLORS.length]}
                    className="outline-none"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value: number) => [`${value} leads`, undefined]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartWrapper>

      {/* Source Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Conv. %</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sources.map((s, i) => (
              <TableRow key={s.source}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {s.source}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.leadCount}</TableCell>
                <TableCell className="text-right tabular-nums">{s.bookings}</TableCell>
                <TableCell className="text-right tabular-nums">{s.conversionRate}%</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
