"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { toast } from "sonner";
import { NotificationBell } from "./NotificationBell";

interface Props {
  userName: string;
  userRole: string;
  onMenuClick: () => void;
}

export function TopNavbar({ userName, userRole, onMenuClick }: Props) {
  const router = useRouter();

  async function handleLogout() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          // No router.refresh() after push — it cancels the pending navigation
          // and leaves the user on the authenticated page after signing out.
          router.push("/login");
        },
        onError: () => {
          toast.error("Sign out failed");
        },
      },
    });
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-xl md:px-6">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary md:hidden"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1 truncate text-sm font-semibold md:hidden">Safar CRM</div>
      <div className="hidden min-w-0 flex-1 md:block">
        <div className="text-sm font-semibold leading-none">Operations cockpit</div>
        <div className="mt-1 text-xs text-muted-foreground">Customers, pipeline, bookings, and payments</div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="hidden text-right md:block">
          <div className="text-sm leading-none font-medium">{userName}</div>
          <div className="text-muted-foreground text-xs">{userRole}</div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
