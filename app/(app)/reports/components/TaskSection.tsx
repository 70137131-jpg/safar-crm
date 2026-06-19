"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ListChecks, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { ChartWrapper, StatCard } from "./ChartWrapper";
import { getTaskReportAction } from "@/modules/reports/report.actions";
import { CHART_SERIES } from "@/lib/charts/palette";
import type { TaskPerformanceReport } from "@/modules/reports/report.types";

interface Props {
  filters: Record<string, unknown>;
}

export function TaskSection({ filters }: Props) {
  const [data, setData] = useState<TaskPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTaskReportAction(filters).then((r) => {
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
                <div className="h-7 w-16 rounded bg-muted" />
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
      <ChartWrapper empty emptyMessage="No task data available." emptyIcon={<ListChecks className="h-10 w-10" />} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Open"
          value={data.open}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Completed"
          value={data.completed}
          icon={<CheckCircle2 className="h-5 w-5" />}
          trend="up"
        />
        <StatCard
          title="Overdue"
          value={data.overdue}
          icon={<AlertTriangle className="h-5 w-5" />}
          trend={data.overdue > 0 ? "down" : "neutral"}
        />
        <StatCard
          title="Completion Rate"
          value={`${data.completionRate}%`}
          trend={data.completionRate > 70 ? "up" : "neutral"}
        />
        <StatCard
          title="Avg Completion"
          value={`${data.averageCompletionHours}h`}
          subtitle="Average hours to complete"
        />
      </div>

      {/* Trend Chart */}
      <ChartWrapper empty={data.monthlyTrend.length === 0} emptyMessage="No monthly trend data.">
        <h3 className="mb-4 text-sm font-semibold">Task Trend</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthlyTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
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
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="created"
                name="Created"
                stroke={CHART_SERIES.info}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="completed"
                name="Completed"
                stroke={CHART_SERIES.positive}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartWrapper>
    </div>
  );
}
