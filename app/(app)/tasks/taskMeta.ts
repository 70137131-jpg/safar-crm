import type { TaskType, TaskStatus } from "@prisma/client";
import {
  PhoneCall,
  BookUser,
  Wallet,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/common/StatusBadge";

/**
 * Client-safe presentation metadata + helpers for tasks. No server imports.
 */

export const TASK_TYPE_META: Record<
  TaskType,
  { label: string; tone: StatusTone; icon: LucideIcon }
> = {
  FOLLOW_UP: { label: "Follow-up", tone: "info", icon: PhoneCall },
  PASSPORT_EXPIRY: { label: "Passport expiry", tone: "warning", icon: BookUser },
  PAYMENT_DUE: { label: "Payment due", tone: "warning", icon: Wallet },
  OTHER: { label: "Other", tone: "neutral", icon: StickyNote },
};

/** Types a user may create by hand. The other two are produced by cron sweeps. */
export const MANUAL_TASK_TYPES = [
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "OTHER", label: "Other" },
] as const satisfies readonly { value: TaskType; label: string }[];

export function isOverdue(dueDate: Date | string, status: TaskStatus): boolean {
  if (status !== "OPEN") return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function formatTaskDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

/** Relative-ish helper: "Overdue by 3d", "Due today", "Due in 2d". */
export function dueLabel(dueDate: Date | string, status: TaskStatus): string {
  if (status !== "OPEN") return formatTaskDate(dueDate);
  const due = new Date(dueDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDue = new Date(due);
  startOfDue.setHours(0, 0, 0, 0);
  const days = Math.round(
    (startOfDue.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  if (days === 0) return "Due today";
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

export function todayInputValue(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}
