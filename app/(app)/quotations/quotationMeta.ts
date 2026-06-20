import type { QuotationStatus } from "@prisma/client";
import type { StatusTone } from "@/components/common/StatusBadge";

/** Client-safe presentation metadata + helpers for quotations. */

export const QUOTATION_STATUS_ORDER: readonly QuotationStatus[] = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
];

export const QUOTATION_STATUS_META: Record<
  QuotationStatus,
  { label: string; tone: StatusTone }
> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  EXPIRED: { label: "Expired", tone: "danger" },
};

export function formatQuotationDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

export function formatQuotationDateTime(
  d: Date | string | null | undefined,
): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0] ?? "";
}

export function isExpiringSoon(
  validTill: Date | string | null,
  status: QuotationStatus,
): boolean {
  if (status !== "SENT" || !validTill) return false;
  const week = new Date();
  week.setDate(week.getDate() + 7);
  return new Date(validTill) <= week;
}
