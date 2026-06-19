"use server";

import { requireUser } from "@/lib/auth/session";
import { serverAction } from "@/lib/errors";
import { reportFiltersSchema, exportReportSchema } from "./report.schemas";
import type {
  RevenueReport,
  LeadFunnelReport,
  AgentPerformanceReport,
  DestinationReport,
  LeadSourceReport,
  PaymentsReport,
  TaskPerformanceReport,
  OverviewDashboard,
  ReportType,
  ExportFormat,
} from "./report.types";
import * as service from "./report.service";

/**
 * Report server actions. Each: requireUser() → Zod parse → service → ActionResult.
 */

export const getRevenueReportAction = serverAction(
  "reports.revenue",
  async (params: Record<string, unknown>): Promise<RevenueReport> => {
    const user = await requireUser();
    return service.getRevenueReport(user, reportFiltersSchema.parse(params));
  },
);

export const getLeadFunnelAction = serverAction(
  "reports.leadFunnel",
  async (params: Record<string, unknown>): Promise<LeadFunnelReport> => {
    const user = await requireUser();
    return service.getLeadFunnel(user, reportFiltersSchema.parse(params));
  },
);

export const getAgentPerformanceAction = serverAction(
  "reports.agentPerformance",
  async (params: Record<string, unknown>): Promise<AgentPerformanceReport> => {
    const user = await requireUser();
    return service.getAgentPerformance(user, reportFiltersSchema.parse(params));
  },
);

export const getDestinationReportAction = serverAction(
  "reports.destination",
  async (params: Record<string, unknown>): Promise<DestinationReport> => {
    const user = await requireUser();
    return service.getDestinationReport(user, reportFiltersSchema.parse(params));
  },
);

export const getLeadSourceReportAction = serverAction(
  "reports.leadSource",
  async (params: Record<string, unknown>): Promise<LeadSourceReport> => {
    const user = await requireUser();
    return service.getLeadSourceReport(user, reportFiltersSchema.parse(params));
  },
);

export const getPaymentsReportAction = serverAction(
  "reports.payments",
  async (params: Record<string, unknown>): Promise<PaymentsReport> => {
    const user = await requireUser();
    return service.getPaymentsReport(user, reportFiltersSchema.parse(params));
  },
);

export const getTaskReportAction = serverAction(
  "reports.tasks",
  async (params: Record<string, unknown>): Promise<TaskPerformanceReport> => {
    const user = await requireUser();
    return service.getTaskReport(user, reportFiltersSchema.parse(params));
  },
);

export const getOverviewDashboardAction = serverAction(
  "reports.overview",
  async (params: Record<string, unknown>): Promise<OverviewDashboard> => {
    const user = await requireUser();
    return service.getOverviewDashboard(user, reportFiltersSchema.parse(params));
  },
);

export const exportReportAction = serverAction(
  "reports.export",
  async (
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; reportType: ReportType; format: ExportFormat }> => {
    const user = await requireUser();
    const parsed = exportReportSchema.parse(params);
    return service.exportReport(user, parsed.reportType, parsed.format, parsed.filters);
  },
);
