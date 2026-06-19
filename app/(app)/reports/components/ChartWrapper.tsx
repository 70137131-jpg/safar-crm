"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  children?: ReactNode;
  className?: string;
  loading?: boolean;
  empty?: boolean;
  emptyIcon?: ReactNode;
  emptyMessage?: string;
}

export function ChartWrapper({
  children,
  className,
  loading,
  empty,
  emptyIcon,
  emptyMessage = "No data available for the selected period.",
}: Props) {
  if (loading) {
    return (
      <div className={cn("rounded-lg border bg-card p-6", className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-[260px] rounded bg-muted/60" />
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={cn("rounded-lg border bg-card p-6", className)}>
        <div className="flex h-[260px] flex-col items-center justify-center text-center text-muted-foreground">
          {emptyIcon && <div className="mb-3 opacity-40">{emptyIcon}</div>}
          <p className="text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card p-6", className)}>
      {children}
    </div>
  );
}

/**
 * Stat card used across report sections.
 */
export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
      <div className="mt-2">
        <p
          className={cn(
            "text-2xl font-bold tracking-tight",
            trend === "up" && "text-emerald-600 dark:text-emerald-400",
            trend === "down" && "text-red-600 dark:text-red-400",
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
