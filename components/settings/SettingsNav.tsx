"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Users, Building2, Tag, Mail, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Settings sub-navigation. Vertical rail on desktop, horizontal scrollable
 * tabs on mobile. Item hrefs are literals so they satisfy typed routes; the
 * layout decides which are visible via `allowed`.
 */
const ALL_ITEMS = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/settings/agency", label: "Agency", icon: Building2 },
  { href: "/settings/lead-sources", label: "Lead sources", icon: Tag },
  { href: "/settings/email", label: "Email", icon: Mail },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/roles", label: "Roles", icon: ShieldCheck },
] as const;

export function SettingsNav({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const items = ALL_ITEMS.filter((i) => allowed.includes(i.href));

  return (
    <nav aria-label="Settings" className="md:w-56 md:shrink-0">
      <ul className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href as Route}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
