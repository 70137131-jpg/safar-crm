"use client";

import { useEffect, useState } from "react";
import { Users, Trophy, Target } from "lucide-react";
import { ChartWrapper } from "./ChartWrapper";
import { getAgentPerformanceAction } from "@/modules/reports/report.actions";
import type { AgentPerformanceReport } from "@/modules/reports/report.types";
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

export function AgentSection({ filters }: Props) {
  const [data, setData] = useState<AgentPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAgentPerformanceAction(filters).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filters]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-7 w-32 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <ChartWrapper loading />
      </div>
    );
  }

  if (!data || data.agents.length === 0) {
    return (
      <ChartWrapper empty emptyMessage="No agent performance data available." emptyIcon={<Users className="h-10 w-10" />} />
    );
  }

  const fmt = (v: string) => formatPKR(deserialize(v));

  return (
    <div className="space-y-6">
      {/* Leaderboard */}
      <div className="grid gap-4 sm:grid-cols-2">
        {data.leaderboard.highestRevenue && (
          <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-transparent p-5">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Trophy className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-wide">Top Revenue</p>
            </div>
            <p className="mt-2 text-xl font-bold">{data.leaderboard.highestRevenue.agentName}</p>
            <p className="text-sm text-muted-foreground">
              {fmt(data.leaderboard.highestRevenue.revenueBooked)}
            </p>
          </div>
        )}
        {data.leaderboard.highestConversion && (
          <div className="rounded-lg border bg-gradient-to-br from-emerald-500/10 to-transparent p-5">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Target className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-wide">Top Conversion</p>
            </div>
            <p className="mt-2 text-xl font-bold">{data.leaderboard.highestConversion.agentName}</p>
            <p className="text-sm text-muted-foreground">
              {data.leaderboard.highestConversion.conversionRate}% conversion
            </p>
          </div>
        )}
      </div>

      {/* Performance Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Quotes</TableHead>
              <TableHead className="text-right">Conv. %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.agents.map((agent) => (
              <TableRow key={agent.agentId}>
                <TableCell className="font-medium">{agent.agentName}</TableCell>
                <TableCell className="text-right tabular-nums">{agent.leadsCreated}</TableCell>
                <TableCell className="text-right tabular-nums">{agent.bookings}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(agent.revenueBooked)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(agent.revenueCollected)}</TableCell>
                <TableCell className="text-right tabular-nums">{agent.quotationsSent}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={agent.conversionRate > 15 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}>
                    {agent.conversionRate}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
