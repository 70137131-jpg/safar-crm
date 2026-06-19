/**
 * Report module types — DTOs returned by services.
 *
 * All money values are serialized as `string` (paisa stringified)
 * to avoid BigInt JSON issues. The UI converts via formatPKR(deserialize(v)).
 */

// ─── Shared ─────────────────────────────────────────────────────────────────

export interface ReportFilters {
  dateFrom: Date;
  dateTo: Date;
  agentId?: string;
  destination?: string;
  status?: string;
}

export type ExportFormat = "csv" | "excel" | "pdf";

export type ReportType =
  | "revenue"
  | "lead-funnel"
  | "agent-performance"
  | "destination"
  | "lead-source"
  | "payments"
  | "tasks";

// ─── Overview Dashboard ─────────────────────────────────────────────────────

export interface OverviewDashboard {
  revenueBooked: string;
  revenueCollected: string;
  outstandingBalance: string;
  activeLeads: number;
  conversionRate: number;
  upcomingTravel: number;
  overdueTasks: number;
  expiringPassports: number;
  recentPayments: RecentPaymentItem[];
  recentBookings: RecentBookingItem[];
  recentQuotations: RecentQuotationItem[];
}

export interface RecentPaymentItem {
  id: string;
  amount: string;
  method: string;
  customerName: string;
  bookingNumber: string;
  paidAt: string;
}

export interface RecentBookingItem {
  id: string;
  bookingNumber: string;
  customerName: string;
  totalPrice: string;
  status: string;
  createdAt: string;
}

export interface RecentQuotationItem {
  id: string;
  quoteNumber: string | null;
  customerName: string | null;
  total: string;
  status: string;
  createdAt: string;
}

// ─── Revenue Report ─────────────────────────────────────────────────────────

export interface RevenueReport {
  revenueBooked: string;
  revenueCollected: string;
  outstandingBalance: string;
  refundTotal: string;
  averageBookingValue: string;
  bookingCount: number;
  monthlyRevenue: MonthlyDataPoint[];
  monthlyCollections: MonthlyDataPoint[];
}

export interface MonthlyDataPoint {
  month: string; // "2026-01"
  label: string; // "Jan 2026"
  value: string; // paisa serialized
}

// ─── Lead Funnel ────────────────────────────────────────────────────────────

export interface LeadFunnelReport {
  stages: LeadFunnelStage[];
  totalLeads: number;
}

export interface LeadFunnelStage {
  stage: string;
  count: number;
  percentage: number;
  dropOff: number;
}

// ─── Agent Performance ──────────────────────────────────────────────────────

export interface AgentPerformanceReport {
  agents: AgentMetrics[];
  leaderboard: {
    highestRevenue: AgentMetrics | null;
    highestConversion: AgentMetrics | null;
  };
}

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  leadsCreated: number;
  bookings: number;
  revenueBooked: string;
  revenueCollected: string;
  quotationsSent: number;
  conversionRate: number;
}

// ─── Destination Performance ────────────────────────────────────────────────

export interface DestinationReport {
  destinations: DestinationMetrics[];
}

export interface DestinationMetrics {
  destination: string;
  bookingsCount: number;
  revenue: string;
  averageBookingValue: string;
  conversionRate: number;
  leadCount: number;
}

// ─── Lead Source Report ─────────────────────────────────────────────────────

export interface LeadSourceReport {
  sources: LeadSourceMetrics[];
}

export interface LeadSourceMetrics {
  source: string;
  leadCount: number;
  bookings: number;
  conversionRate: number;
  revenue: string;
}

// ─── Payments Report ────────────────────────────────────────────────────────

export interface PaymentsReport {
  totalPaid: string;
  totalUnpaid: string;
  totalPartial: string;
  totalRefunded: string;
  outstandingBalances: string;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
  refundedCount: number;
  payments: PaymentReportItem[];
}

export interface PaymentReportItem {
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  totalPrice: string;
  totalPaid: string;
  outstanding: string;
  status: "paid" | "unpaid" | "partial" | "refunded";
  agentName: string | null;
}

// ─── Task Performance ───────────────────────────────────────────────────────

export interface TaskPerformanceReport {
  open: number;
  completed: number;
  overdue: number;
  completionRate: number;
  averageCompletionHours: number;
  monthlyTrend: MonthlyTaskPoint[];
}

export interface MonthlyTaskPoint {
  month: string;
  label: string;
  completed: number;
  created: number;
}
