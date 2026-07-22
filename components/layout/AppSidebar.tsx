"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Workflow,
  CalendarCheck,
  CreditCard,
  FileText,
  ReceiptText,
  ListChecks,
  BarChart3,
  Settings as SettingsIcon,
  Plane,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Leads", href: "/leads", icon: Workflow },
  { label: "Bookings", href: "/bookings", icon: CalendarCheck },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Invoices", href: "/invoices", icon: ReceiptText, roles: ["ADMIN", "MANAGER", "ACCOUNTANT"] },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
] as const;

export function AppSidebar({
  className,
  onNavigate,
  userRole,
}: {
  className?: string;
  onNavigate?: () => void;
  userRole: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex h-full flex-col p-4", className)} aria-label="Primary">
      <div className="mb-5 flex items-center gap-3 rounded-lg border bg-secondary/60 px-3 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
          <Plane className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight">Safar CRM</div>
          <div className="truncate text-xs text-muted-foreground">Travel operations desk</div>
        </div>
      </div>
      <div className="mb-2 px-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
        Workspace
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {NAV.filter((item) => !("roles" in item) || item.roles.some((role) => role === userRole)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                  active
                    ? "border-primary-foreground/20 bg-primary-foreground/15"
                    : "border-transparent bg-background text-muted-foreground group-hover:border-border group-hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-5 rounded-lg border bg-secondary/45 p-3 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Role</div>
        <div className="mt-1 truncate">{userRole}</div>
      </div>
    </nav>
  );
}
