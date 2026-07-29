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
  ListChecks,
  BarChart3,
  Settings as SettingsIcon,
  Bot,
  BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Leads", href: "/leads", icon: Workflow },
  { label: "Bookings", href: "/bookings", icon: CalendarCheck },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "AI Workspace", href: "/ai-insights", icon: BrainCircuit },
  { label: "Ask Safar", href: "/assistant", icon: Bot },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
] as const;

export function AppSidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex h-full flex-col gap-1 p-3", className)} aria-label="Primary">
      <div className="text-muted-foreground px-2 pt-1 pb-4 text-xs font-semibold tracking-wider uppercase">
        Safar CRM
      </div>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
