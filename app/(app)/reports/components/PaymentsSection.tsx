"use client";

import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, Clock, AlertTriangle, RotateCcw } from "lucide-react";
import { StatCard, ChartWrapper } from "./ChartWrapper";
import { getPaymentsReportAction } from "@/modules/reports/report.actions";
import type { PaymentsReport } from "@/modules/reports/report.types";
import { formatPKR, deserialize } from "@/lib/money/paisa";
import { cn } from "@/lib/cn";
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

const STATUS_CONFIG = {
  paid: { label: "Paid", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  partial: { label: "Partial", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  unpaid: { label: "Unpaid", color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
  refunded: { label: "Refunded", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
} as const;

export function PaymentsSection({ filters }: Props) {
  const [data, setData] = useState<PaymentsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPaymentsReportAction(filters).then((r) => {
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
      <ChartWrapper empty emptyMessage="No payment data available." emptyIcon={<CreditCard className="h-10 w-10" />} />
    );
  }

  const fmt = (v: string) => formatPKR(deserialize(v));

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Paid"
          value={fmt(data.totalPaid)}
          subtitle={`${data.paidCount} bookings`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          trend="up"
        />
        <StatCard
          title="Partial"
          value={fmt(data.totalPartial)}
          subtitle={`${data.partialCount} bookings`}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Unpaid"
          value={fmt(data.totalUnpaid)}
          subtitle={`${data.unpaidCount} bookings`}
          icon={<AlertTriangle className="h-5 w-5" />}
          trend={data.unpaidCount > 0 ? "down" : "neutral"}
        />
        <StatCard
          title="Refunded"
          value={fmt(data.totalRefunded)}
          subtitle={`${data.refundedCount} bookings`}
          icon={<RotateCcw className="h-5 w-5" />}
        />
        <StatCard
          title="Outstanding"
          value={fmt(data.outstandingBalances)}
          icon={<CreditCard className="h-5 w-5" />}
          trend={data.outstandingBalances !== "0" ? "down" : "neutral"}
        />
      </div>

      {/* Payments Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No bookings found for the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.payments.map((p) => {
                const config = STATUS_CONFIG[p.status];
                return (
                  <TableRow key={p.bookingId}>
                    <TableCell className="font-medium">{p.bookingNumber}</TableCell>
                    <TableCell>{p.customerName}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.totalPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.totalPaid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.outstanding)}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", config.color, config.bg)}>
                        {config.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.agentName ?? "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
