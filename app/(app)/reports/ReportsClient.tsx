"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  LayoutDashboard,
  DollarSign,
  Workflow,
  Users,
  MapPin,
  Megaphone,
  CreditCard,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ReportFilters } from "./components/ReportFilters";
import { ExportButton } from "./components/ExportButton";
import { OverviewCards } from "./components/OverviewCards";
import { AgentSection } from "./components/AgentSection";
import { PaymentsSection } from "./components/PaymentsSection";
import type { ReportType } from "@/modules/reports/report.types";

/**
 * Recharts-heavy sections are code-split so the library loads only when its tab
 * is first opened, keeping the initial reports bundle small. `ssr: false` is
 * fine here — ReportsClient is already a Client Component. (AgentSection and
 * PaymentsSection are table-only and stay statically imported.)
 */
const sectionLoading = () => <LoadingSkeleton className="h-[400px] w-full" />;
const RevenueSection = dynamic(
  () => import("./components/RevenueSection").then((m) => m.RevenueSection),
  { ssr: false, loading: sectionLoading },
);
const LeadFunnelSection = dynamic(
  () => import("./components/LeadFunnelSection").then((m) => m.LeadFunnelSection),
  { ssr: false, loading: sectionLoading },
);
const DestinationSection = dynamic(
  () => import("./components/DestinationSection").then((m) => m.DestinationSection),
  { ssr: false, loading: sectionLoading },
);
const LeadSourceSection = dynamic(
  () => import("./components/LeadSourceSection").then((m) => m.LeadSourceSection),
  { ssr: false, loading: sectionLoading },
);
const TaskSection = dynamic(
  () => import("./components/TaskSection").then((m) => m.TaskSection),
  { ssr: false, loading: sectionLoading },
);

const TABS = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "revenue" as const, label: "Revenue", icon: DollarSign },
  { id: "leads" as const, label: "Leads", icon: Workflow },
  { id: "agents" as const, label: "Agents", icon: Users },
  { id: "destinations" as const, label: "Destinations", icon: MapPin },
  { id: "sources" as const, label: "Sources", icon: Megaphone },
  { id: "payments" as const, label: "Payments", icon: CreditCard },
  { id: "tasks" as const, label: "Tasks", icon: ListChecks },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_TO_REPORT_TYPE: Partial<Record<TabId, ReportType>> = {
  revenue: "revenue",
  leads: "lead-funnel",
  agents: "agent-performance",
  destinations: "destination",
  sources: "lead-source",
  payments: "payments",
  tasks: "tasks",
};

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0]!;
}

function defaultDateTo(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function ReportsClient() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [agentId, setAgentId] = useState<string>("");
  const [destination, setDestination] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  const filters = {
    dateFrom: new Date(dateFrom).toISOString(),
    dateTo: new Date(dateTo + "T23:59:59").toISOString(),
    ...(agentId ? { agentId } : {}),
    ...(destination ? { destination } : {}),
  };

  const handleApplyFilters = useCallback(() => {
    startTransition(() => {
      setRefreshKey((k) => k + 1);
    });
  }, []);

  // Auto-refresh on tab change
  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, [activeTab]);

  const reportType = TAB_TO_REPORT_TYPE[activeTab];

  return (
    <div className="space-y-6">
      {/* Tab Navigation — scrollable on mobile */}
      <div className="flex items-center gap-3 overflow-x-auto border-b pb-px scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters + Export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ReportFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          agentId={agentId}
          destination={destination}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onAgentIdChange={setAgentId}
          onDestinationChange={setDestination}
          onApply={handleApplyFilters}
          isPending={isPending}
        />
        {reportType && (
          <ExportButton reportType={reportType} filters={filters} />
        )}
      </div>

      {/* Report Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <OverviewCards key={refreshKey} filters={filters} />
        )}
        {activeTab === "revenue" && (
          <RevenueSection key={refreshKey} filters={filters} />
        )}
        {activeTab === "leads" && (
          <LeadFunnelSection key={refreshKey} filters={filters} />
        )}
        {activeTab === "agents" && (
          <AgentSection key={refreshKey} filters={filters} />
        )}
        {activeTab === "destinations" && (
          <DestinationSection key={refreshKey} filters={filters} />
        )}
        {activeTab === "sources" && (
          <LeadSourceSection key={refreshKey} filters={filters} />
        )}
        {activeTab === "payments" && (
          <PaymentsSection key={refreshKey} filters={filters} />
        )}
        {activeTab === "tasks" && (
          <TaskSection key={refreshKey} filters={filters} />
        )}
      </div>
    </div>
  );
}
