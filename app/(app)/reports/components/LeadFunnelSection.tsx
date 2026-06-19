"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Workflow } from "lucide-react";
import { ChartWrapper, StatCard } from "./ChartWrapper";
import { getLeadFunnelAction } from "@/modules/reports/report.actions";
import type { LeadFunnelReport, LeadFunnelStage } from "@/modules/reports/report.types";
import { leadStageColor } from "@/lib/charts/palette";
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

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUOTATION_SENT: "Quote Sent",
  NEGOTIATING: "Negotiating",
  BOOKED: "Booked",
  TRAVELLED: "Travelled",
  LOST: "Lost",
};

export function LeadFunnelSection({ filters }: Props) {
  const [data, setData] = useState<LeadFunnelReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeadFunnelAction(filters).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-7 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <ChartWrapper loading />
      </div>
    );
  }

  if (!data || data.totalLeads === 0) {
    return (
      <ChartWrapper empty emptyMessage="No lead data for the selected period." emptyIcon={<Workflow className="h-10 w-10" />} />
    );
  }

  const bookedStage = data.stages.find((s) => s.stage === "BOOKED");
  const lostStage = data.stages.find((s) => s.stage === "LOST");
  const conversionRate = bookedStage
    ? Math.round((bookedStage.count / data.totalLeads) * 10000) / 100
    : 0;

  const chartData = data.stages.map((s) => ({
    ...s,
    label: STAGE_LABELS[s.stage] ?? s.stage,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Leads"
          value={data.totalLeads}
          icon={<Workflow className="h-5 w-5" />}
        />
        <StatCard
          title="Conversion Rate"
          value={`${conversionRate}%`}
          subtitle={`${bookedStage?.count ?? 0} booked`}
          trend={conversionRate > 10 ? "up" : "neutral"}
        />
        <StatCard
          title="Lost Rate"
          value={`${lostStage?.percentage ?? 0}%`}
          subtitle={`${lostStage?.count ?? 0} lost`}
          trend={lostStage && lostStage.count > 0 ? "down" : "neutral"}
        />
      </div>

      {/* Funnel Chart */}
      <ChartWrapper>
        <h3 className="mb-4 text-sm font-semibold">Lead Funnel</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value, _name, item) => {
                  const stage = item.payload as LeadFunnelStage & { label: string };
                  return [`${value} leads (${stage.percentage}%)`, stage.label];
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={leadStageColor(d.stage)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartWrapper>

      {/* Stage Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">% of Total</TableHead>
              <TableHead className="text-right">Drop-off</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.stages.map((stage, i) => (
              <TableRow key={stage.stage}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: leadStageColor(stage.stage) }}
                    />
                    {STAGE_LABELS[stage.stage] ?? stage.stage}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{stage.count}</TableCell>
                <TableCell className="text-right tabular-nums">{stage.percentage}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {i === 0 ? "—" : `${stage.dropOff}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
