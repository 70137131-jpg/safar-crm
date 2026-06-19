"use client";

import { useState } from "react";
import { Download, FileText, Table, Printer } from "lucide-react";
import { exportReportAction } from "@/modules/reports/report.actions";
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  paisaToExportPKR,
} from "@/modules/reports/export";
import type { ReportType } from "@/modules/reports/report.types";
import { Button } from "@/components/ui/button";

interface Props {
  reportType: ReportType;
  filters: Record<string, unknown>;
}

const FORMAT_OPTIONS = [
  { id: "csv" as const, label: "CSV", icon: Table },
  { id: "excel" as const, label: "Excel", icon: FileText },
  { id: "pdf" as const, label: "PDF", icon: Printer },
] as const;

export function ExportButton({ reportType, filters }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleExport(format: "csv" | "excel" | "pdf") {
    setOpen(false);
    if (format === "pdf") {
      exportToPDF();
      return;
    }

    setExporting(true);
    try {
      const result = await exportReportAction({
        reportType,
        format,
        filters,
      });

      if (!result.ok) {
        console.error("Export failed:", result.message);
        return;
      }

      const { data } = result.data;
      const { headers, rows } = flattenReportData(data, reportType);
      const filename = `safar-${reportType}-report-${new Date().toISOString().split("T")[0]}`;

      if (format === "csv") {
        exportToCSV(headers, rows, filename);
      } else {
        exportToExcel(headers, rows, filename);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <Button
        id="export-button"
        variant="outline"
        onClick={() => setOpen(!open)}
        disabled={exporting}
      >
        <Download className="mr-2 h-4 w-4" />
        {exporting ? "Exporting…" : "Export"}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border bg-popover p-1 shadow-lg">
            {FORMAT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <Button
                  key={opt.id}
                  id={`export-${opt.id}`}
                  variant="ghost"
                  onClick={() => handleExport(opt.id)}
                  className="flex w-full justify-start items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm font-normal transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Flatten report DTOs into tabular [headers, rows] for CSV/Excel.
 */
function flattenReportData(
  data: unknown,
  reportType: ReportType,
): { headers: string[]; rows: (string | number)[][] } {
  const d = data as Record<string, unknown>;

  switch (reportType) {
    case "revenue": {
      return {
        headers: ["Metric", "Value (PKR)"],
        rows: [
          ["Revenue Booked", paisaToExportPKR(d.revenueBooked as string)],
          ["Revenue Collected", paisaToExportPKR(d.revenueCollected as string)],
          ["Outstanding Balance", paisaToExportPKR(d.outstandingBalance as string)],
          ["Refund Total", paisaToExportPKR(d.refundTotal as string)],
          ["Average Booking Value", paisaToExportPKR(d.averageBookingValue as string)],
          ["Total Bookings", d.bookingCount as number],
        ],
      };
    }
    case "lead-funnel": {
      const stages = (d.stages as { stage: string; count: number; percentage: number; dropOff: number }[]) ?? [];
      return {
        headers: ["Stage", "Count", "% of Total", "Drop-off %"],
        rows: stages.map((s) => [s.stage, s.count, `${s.percentage}%`, `${s.dropOff}%`]),
      };
    }
    case "agent-performance": {
      const agents = (d.agents as { agentName: string; leadsCreated: number; bookings: number; revenueBooked: string; revenueCollected: string; quotationsSent: number; conversionRate: number }[]) ?? [];
      return {
        headers: ["Agent", "Leads", "Bookings", "Revenue Booked", "Revenue Collected", "Quotations", "Conversion %"],
        rows: agents.map((a) => [
          a.agentName, a.leadsCreated, a.bookings,
          paisaToExportPKR(a.revenueBooked), paisaToExportPKR(a.revenueCollected),
          a.quotationsSent, `${a.conversionRate}%`,
        ]),
      };
    }
    case "destination": {
      const dests = (d.destinations as { destination: string; bookingsCount: number; revenue: string; averageBookingValue: string; conversionRate: number; leadCount: number }[]) ?? [];
      return {
        headers: ["Destination", "Leads", "Bookings", "Revenue", "Avg Booking", "Conversion %"],
        rows: dests.map((r) => [
          r.destination, r.leadCount, r.bookingsCount,
          paisaToExportPKR(r.revenue), paisaToExportPKR(r.averageBookingValue),
          `${r.conversionRate}%`,
        ]),
      };
    }
    case "lead-source": {
      const sources = (d.sources as { source: string; leadCount: number; bookings: number; conversionRate: number; revenue: string }[]) ?? [];
      return {
        headers: ["Source", "Leads", "Bookings", "Conversion %", "Revenue"],
        rows: sources.map((s) => [
          s.source, s.leadCount, s.bookings, `${s.conversionRate}%`,
          paisaToExportPKR(s.revenue),
        ]),
      };
    }
    case "payments": {
      const payments = (d.payments as { bookingNumber: string; customerName: string; totalPrice: string; totalPaid: string; outstanding: string; status: string; agentName: string | null }[]) ?? [];
      return {
        headers: ["Booking", "Customer", "Total Price", "Paid", "Outstanding", "Status", "Agent"],
        rows: payments.map((p) => [
          p.bookingNumber, p.customerName,
          paisaToExportPKR(p.totalPrice), paisaToExportPKR(p.totalPaid),
          paisaToExportPKR(p.outstanding), p.status, p.agentName ?? "—",
        ]),
      };
    }
    case "tasks": {
      return {
        headers: ["Metric", "Value"],
        rows: [
          ["Open", d.open as number],
          ["Completed", d.completed as number],
          ["Overdue", d.overdue as number],
          ["Completion Rate", `${d.completionRate}%`],
          ["Avg Completion (hours)", d.averageCompletionHours as number],
        ],
      };
    }
    default:
      return { headers: [], rows: [] };
  }
}
