"use client";

import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopNavbar } from "./TopNavbar";
import { cn } from "@/lib/cn";

interface Props {
  userName: string;
  userRole: string;
  children: React.ReactNode;
}

/**
 * App shell: persistent sidebar on md+, slide-in drawer on smaller screens.
 * The shell stays client-side (state for drawer); pages render as children.
 */
export function AppShell({ userName, userRole, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Skip link — first focusable element, visible only on keyboard focus (WCAG 2.4.1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground focus:shadow-md"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        <AppSidebar />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-30 transition-opacity md:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close menu"
          className="absolute inset-0 bg-black/40"
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 h-full w-64 border-r bg-card shadow-xl transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <AppSidebar onNavigate={() => setOpen(false)} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar userName={userName} userRole={userRole} onMenuClick={() => setOpen(true)} />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
