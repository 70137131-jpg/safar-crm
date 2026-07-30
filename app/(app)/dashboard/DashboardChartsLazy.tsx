"use client";

import dynamic from "next/dynamic";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";

/**
 * Client wrappers that code-split Recharts off the dashboard's critical path.
 *
 * The chart primitives live in `DashboardCharts.tsx`, which pulls in ~100 KB of
 * Recharts. Loading them via `next/dynamic({ ssr: false })` moves that bundle
 * into a separate async chunk fetched after hydration, so the initial dashboard
 * JS stays small. The widgets that render these (MonthlyTrends / TopDestinations)
 * are Server Components, where `ssr: false` is not allowed — hence this thin
 * Client wrapper. The fixed-height fallback matches the chart container so the
 * deferred load causes no layout shift.
 */

const chartFallback = () => <LoadingSkeleton className="h-[280px] w-full" />;

export const MonthlyTrendsChart = dynamic(
  () => import("./DashboardCharts").then((m) => m.MonthlyTrendsChart),
  { ssr: false, loading: chartFallback },
);

export const TopDestinationsChart = dynamic(
  () => import("./DashboardCharts").then((m) => m.TopDestinationsChart),
  { ssr: false, loading: chartFallback },
);
