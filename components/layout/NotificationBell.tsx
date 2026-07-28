"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Bell, Bot, CheckCircle2, CheckCheck, Clock3, FileClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import type {
  AssistantNotificationDTO,
  AssistantNotificationListDTO,
} from "@/modules/assistant/assistant-notifications.types";

const POLL_MS = 60_000;

function NotificationIcon({ kind }: { kind: AssistantNotificationDTO["kind"] }) {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  if (kind === "TASK_DUE") return <Clock3 className={cn(className, "text-amber-600")} />;
  if (kind === "QUOTATION_EXPIRING") {
    return <FileClock className={cn(className, "text-orange-600")} />;
  }
  if (kind === "ACTION_COMPLETED") {
    return <CheckCircle2 className={cn(className, "text-emerald-600")} />;
  }
  return <Bot className={cn(className, "text-primary")} />;
}

export function NotificationBell() {
  const [data, setData] = useState<AssistantNotificationListDTO>({
    items: [],
    unreadCount: 0,
  });

  const refresh = useCallback(async () => {
    const response = await fetch("/api/assistant/notifications", {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return;
    setData((await response.json()) as AssistantNotificationListDTO);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  async function markRead(id: string) {
    setData((current) => ({
      unreadCount: Math.max(
        0,
        current.unreadCount - (current.items.find((item) => item.id === id)?.readAt ? 0 : 1),
      ),
      items: current.items.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    }));
    await fetch("/api/assistant/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    }).catch(() => null);
  }

  async function markAllRead() {
    setData((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    }));
    await fetch("/api/assistant/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    }).catch(() => null);
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && void refresh()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-foreground relative inline-flex h-9 w-9 items-center justify-center rounded-md"
          aria-label={
            data.unreadCount > 0 ? `${data.unreadCount} unread notifications` : "Notifications"
          }
        >
          <Bell className="h-4 w-4" />
          {data.unreadCount > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {data.unreadCount > 99 ? "99+" : data.unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Ask Safar notifications</DropdownMenuLabel>
          {data.unreadCount > 0 && (
            <button
              type="button"
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {data.items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            You are all caught up.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto p-1">
            {data.items.map((item) => (
              <DropdownMenuItem key={item.id} asChild className="items-start p-0">
                <Link
                  href={item.href as Route}
                  onClick={() => void markRead(item.id)}
                  className={cn(
                    "flex w-full gap-3 rounded-sm px-3 py-2.5",
                    !item.readAt && "bg-primary/5",
                  )}
                >
                  <NotificationIcon kind={item.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs leading-5">
                      {item.body}
                    </span>
                  </span>
                  {!item.readAt && (
                    <span
                      className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      aria-label="Unread"
                    />
                  )}
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="m-1 justify-center">
          <Link href="/assistant">Open Ask Safar</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
