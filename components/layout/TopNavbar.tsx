"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { toast } from "sonner";

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
          router.push("/login");
          router.refresh();
        },
        onError: () => {
          toast.error("Sign out failed");
        },
      },
    });
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1 truncate text-sm font-semibold md:hidden">Safar CRM</div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right md:block">
          <div className="text-sm font-medium leading-none">{userName}</div>
          <div className="text-xs text-muted-foreground">{userRole}</div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
